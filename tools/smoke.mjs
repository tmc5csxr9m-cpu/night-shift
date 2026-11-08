// Drive the desktop program through the Chrome DevTools Protocol: trusted
// mouse/keyboard input, JS evaluation, screenshots. Works for the dev shell
// and for packaged builds. Run under a virtual display:
//   xvfb-run -a -s "-screen 0 1280x720x24" node tools/smoke.mjs <script.mjs> [-- <program> args...]
// <script.mjs> default-exports async (app) => { ... } using the helpers below.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const scriptPath = argv[0];
const program = sep >= 0 ? argv.slice(sep + 1) : null;
const PORT = 9333 + Math.floor(Math.random() * 500);
const OUT = process.env.SMOKE_OUT || '/tmp/ns-smoke';
mkdirSync(OUT, { recursive: true });

let devServer = null;
let cmd;
let args;
// stay on the virtual display: never fall through to the user's Wayland session
let env = { ...process.env };
delete env.WAYLAND_DISPLAY;
env.ELECTRON_OZONE_PLATFORM_HINT = 'x11';
// never touch the player's real save: a throwaway profile unless one is given
const profile = process.env.NIGHTSHIFT_USER_DATA ? null : mkdtempSync(join(tmpdir(), 'ns-smoke-profile-'));
if (profile) env.NIGHTSHIFT_USER_DATA = profile;
if (program) {
  [cmd, ...args] = program;
} else {
  // dev shell: vite + electron
  const { createServer } = await import('vite');
  devServer = await createServer({ server: { port: 5299, strictPort: false }, logLevel: 'error' });
  await devServer.listen();
  const { default: electron } = await import('electron');
  cmd = electron;
  args = ['.'];
  env.NS_DEV_URL = `http://localhost:${devServer.config.server.port}/`;
}
const child = spawn(cmd, [...args, `--remote-debugging-port=${PORT}`, '--no-sandbox', '--ozone-platform=x11'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let exited = null;
child.on('exit', (c) => (exited = c ?? 0));
child.on('error', (e) => {
  console.error('SMOKE FAIL: cannot start', e.message);
  exited = -1;
});

async function cleanup() {
  if (exited === null) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch { /* already gone */ }
  }
  await devServer?.close();
  if (profile) {
    // Electron may still be flushing its profile for a moment
    await new Promise((r) => setTimeout(r, 500));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
      console.warn('could not remove test profile', profile, e.code);
    }
  }
}
child.stderr.on('data', (d) => process.env.SMOKE_VERBOSE && process.stderr.write(d));

async function target() {
  for (let i = 0; i < 600; i++) {
    if (exited !== null) throw new Error(`program exited (${exited}) before its page came up`);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page' && !x.url.startsWith('devtools'));
      if (t) return t;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('no page target');
}

let ws;
try {
  const t = await target();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
} catch (e) {
  console.error('SMOKE FAIL:', e.message);
  await cleanup();
  process.exit(1);
}
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, no } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? no(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push(`${msg.params.type} ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
};
ws.onclose = () => {
  for (const { no } of pending.values()) no(new Error('connection closed'));
  pending.clear();
};
const send = (method, params = {}) => new Promise((ok, no) => {
  if (ws.readyState !== WebSocket.OPEN) return no(new Error('connection closed'));
  const i = ++id;
  const timer = setTimeout(() => {
    pending.delete(i);
    no(new Error(`timeout: ${method}`));
  }, 15000);
  pending.set(i, { ok: (v) => (clearTimeout(timer), ok(v)), no: (e) => (clearTimeout(timer), no(e)) });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');

const app = {
  sleep,
  logs,
  get exited() {
    return exited;
  },
  async eval(expr) {
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  },
  async waitFor(expr, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await app.eval(expr).catch(() => false)) return true;
      await sleep(150);
    }
    throw new Error('timeout waiting for ' + expr);
  },
  async click(x, y, button = 'left') {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
  },
  // press, keep the button down for ms, release (hold-to-use objects)
  async hold(x, y, ms) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(ms);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  },
  async move(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  },
  async key(type, key, code, vk) {
    await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  },
  // raw DevTools protocol (e.g. Emulation.setDeviceMetricsOverride for a fixed render size)
  cdp: send,
  async shot(name, { format = 'png', quality } = {}) {
    const r = await send('Page.captureScreenshot', { format, quality });
    const file = `${OUT}/${name}.${format === 'jpeg' ? 'jpg' : format}`;
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  },
};

let code = 0;
try {
  const { default: run } = await import(pathToFileURL(resolve(scriptPath)).href);
  await run(app);
} catch (e) {
  console.error('SMOKE FAIL:', e.message);
  code = 1;
}
if (logs.length) console.log('page log:\n  ' + logs.join('\n  '));
// an uncaught exception in the page fails the run
if (logs.some((l) => l.startsWith('EXCEPTION'))) {
  console.error('SMOKE FAIL: uncaught exception in the page');
  code = 1;
}
try {
  ws.close();
} catch { /* closed */ }
await cleanup();
process.exit(code);
