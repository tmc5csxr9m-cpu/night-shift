// Desktop shell (Electron). The game is no longer meant to run in a plain
// browser: this process serves the built files over a private app://
// scheme, owns the save file, the window mode and the "hold ESC to quit".
const { app, BrowserWindow, protocol, net, ipcMain, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DEV_URL = process.env.NS_DEV_URL || null;      // set by tools/dev.mjs
// debug mode is a tester's tool: shown in the Linux (AppImage) build and in
// development, hidden from the Windows release build
const DEBUG_BUILD = !app.isPackaged || process.platform === 'linux';
const ESC_HOLD = 1.2;                                 // seconds (in a night: back to the menu; in the menu: quit)
const DIST = path.join(__dirname, '..', 'dist');

// one stable folder for saves, whatever the executable is called or where
// a portable build unpacks itself (%APPDATA%\NightShift, ~/.config/NightShift)
app.setPath('userData', path.join(app.getPath('appData'), 'NightShift'));
app.commandLine.appendSwitch('ignore-gpu-blocklist');   // old GPUs: still try WebGL
app.commandLine.appendSwitch('disable-renderer-backgrounding');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  // a second copy would fight over the save file
  app.exit(0);
}

// ------------------------------------------------------------------ save file
const SAVE = () => path.join(app.getPath('userData'), 'save.json');

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// write to a temp file, flush, keep the previous save as .bak, then swap in.
// Windows antivirus / indexers can hold the file for a moment: retry.
function writeSave(text) {
  const file = SAVE();
  const tmp = file + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, file + '.bak');
      } catch { /* a missing backup is not fatal */ }
    }
    for (let i = 0; i < 6; i++) {
      try {
        fs.renameSync(tmp, file);
        return true;
      } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i === 5) throw e;
        sleepSync(30 * (i + 1));
      }
    }
  } catch (e) {
    try {
      fs.writeFileSync(file, text);   // last resort: direct write
      return true;
    } catch {
      console.error('save failed', e);
      return false;
    }
  }
  return false;
}

// ------------------------------------------------------------------ window mode
const MODES = { fullscreen: null, '1280x720': [1280, 720], '1600x900': [1600, 900], '1920x1080': [1920, 1080] };

function savedMode() {
  try {
    const m = JSON.parse(readFile(SAVE()) || '{}')?.settings?.display;
    return MODES[m] !== undefined ? m : 'fullscreen';
  } catch {
    return 'fullscreen';
  }
}

function applyMode(win, mode) {
  if (!win || MODES[mode] === undefined) return;
  if (mode === 'fullscreen') {
    win.setFullScreen(true);
    return;
  }
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  const [w, h] = MODES[mode];
  const size = () => {
    win.setContentSize(Math.min(w, area.width), Math.min(h, area.height));
    win.center();
  };
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => setTimeout(size, 50));
    win.setFullScreen(false);
  } else size();
}

// ------------------------------------------------------------------ app
let win = null;

function createWindow() {
  const mode = savedMode();
  const [w, h] = MODES[mode] || [1280, 720];
  win = new BrowserWindow({
    width: w,
    height: h,
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    fullscreen: mode === 'fullscreen',
    backgroundColor: '#000000',
    show: false,
    title: 'Night Shift',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEBUG_BUILD,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => {
    if (url !== wc.getURL()) e.preventDefault();
  });

  // hold ESC. Watched here, not in the page, so pointer lock and the page's
  // own ESC handling cannot swallow it. The page decides what a long press
  // means (leave the night / quit).
  let escAt = 0;
  let escTimer = null;
  const stopEsc = () => {
    if (!escTimer) return;
    clearInterval(escTimer);
    escTimer = null;
    if (!wc.isDestroyed()) wc.send('esc-hold', 0);
  };
  wc.on('before-input-event', (e, input) => {
    if (input.key === 'Escape') {
      if (input.type === 'keyDown' && !escTimer) {
        escAt = Date.now();
        escTimer = setInterval(() => {
          const p = (Date.now() - escAt) / 1000 / ESC_HOLD;
          if (!wc.isDestroyed()) wc.send('esc-hold', Math.min(1, p));
          if (p >= 1) {
            stopEsc();
            if (!wc.isDestroyed()) wc.send('esc-long');
          }
        }, 40);
      } else if (input.type === 'keyUp') stopEsc();
    }
    if (DEBUG_BUILD && input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools();
  });
  win.on('blur', stopEsc);

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL('app://game/index.html');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.ogg': 'audio/ogg', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml',
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response('forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!res.ok) return res;
    const type = MIME[path.extname(file).toLowerCase()];
    return new Response(res.body, { status: 200, headers: type ? { 'content-type': type } : {} });
  });

  ipcMain.on('app:info', (e) => {
    e.returnValue = { debugBuild: DEBUG_BUILD, platform: process.platform, version: app.getVersion() };
  });
  ipcMain.on('save:read', (e) => {
    const file = SAVE();
    e.returnValue = { main: readFile(file), bak: readFile(file + '.bak'), path: file };
  });
  ipcMain.on('save:write', (e, text) => {
    e.returnValue = typeof text === 'string' ? writeSave(text) : false;
  });
  ipcMain.handle('display:set', (e, mode) => applyMode(BrowserWindow.fromWebContents(e.sender), mode));
  ipcMain.on('app:quit', () => app.quit());

  createWindow();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => app.quit());
