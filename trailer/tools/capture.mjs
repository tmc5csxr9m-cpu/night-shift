// Records trailer footage from the real game: fixed 1/30 s steps, one JPEG per frame.
import { mkdirSync } from 'node:fs';
const ROOT = process.env.SMOKE_OUT;
const ONLY = process.env.CLIPS ? process.env.CLIPS.split(',') : null;
const G = 'window.__game';

const HELPERS = `(() => {
  const g = ${G};
  g.save.recordNight = () => {};
  g.save.write = () => true;
  const st = document.createElement('style');
  st.textContent = '#dbgGhost,#cursor,#hint{display:none!important} #intro,#subtitle{transition:none!important}';
  document.head.appendChild(st);
  const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  window.__cap = {
    ease,
    night(n, t) {
      g.startNight(n, true);
      g.game.debug = false;
      document.getElementById('intro').classList.remove('show');
      g.view.hasMouse = false;
      g.view.cinematic = null;
      g.view.yaw = 0;
      g.view.pitch = -0.1;
      if (t) g.game.world.dbg('setTime', { t });
    },
    skip(s, dt = 0.25) { g.step(Math.ceil(s / dt), dt); },
    aim(obj) {
      const THREE_V = obj.getWorldPosition(g.camera.position.clone());
      const dx = THREE_V.x, dz = THREE_V.z - 0.35;
      return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(THREE_V.y - 1.2, Math.hypot(dx, dz)) };
    },
    look(yaw, pitch) { g.view.yaw = yaw; if (pitch !== undefined) g.view.pitch = pitch; },
  };
  return true;
})()`;

const CLIPS = [
  { name: 'menu', frames: 90,
    setup: `g.showMenu(); __cap.skip(2.5, 0.1);`,
    frame: `` },
  { name: 'intro', frames: 84,
    setup: `__cap.night(1); const it = document.getElementById('intro'); it.classList.add('show'); it.style.opacity = 0;`,
    frame: `document.getElementById('intro').style.opacity = i < 12 ? i / 12 : i > 66 ? Math.max(0, 1 - (i - 66) / 14) : 1; __cap.look(0, -0.06 + i * 0.0006);` },
  { name: 'sunny', frames: 130,
    setup: `__cap.night(1, 200); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'sunny', node: 'DOOR_L' }); w.actor('sunny').attackT = 99; w.actor('sunny').litT = 0;`,
    frame: `__cap.look(1.55 * __cap.ease(i / 18), -0.02); if (i === 24) g.game.cmd('doorLight', { side: 'L', on: true }); if (i === 118) g.game.cmd('doorLight', { side: 'L', on: false });` },
  { name: 'pip', frames: 96,
    setup: `__cap.night(2, 220); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'pip', node: 'DOOR_R' }); w.actor('pip').attackT = 99; __cap.look(-1.55, -0.02);`,
    frame: `if (i === 6) g.game.cmd('doorLight', { side: 'R', on: true }); __cap.look(-1.55 + 0.004 * i, -0.02);` },
  { name: 'map', frames: 120,
    setup: `__cap.night(2, 250); g.game.world.calibrated.lure = true; __cap.skip(5); g.enterFocus(); g.term.go('map'); __cap.skip(1.5, 0.05);`,
    frame: `if (i === 10) g.game.cmd('scan', { room: '02' }); if (i === 40) g.game.cmd('scan', { room: '08' }); if (i === 70) g.game.cmd('lure', { room: '06' }); if (i === 80) g.game.cmd('roomLight', { room: '07', on: true });` },
  { name: 'stuckclock', frames: 75,
    setup: `__cap.night(6); const w = g.game.world; for (const t of w.tasks) if (t.id !== 'T-08c') t.done = true; w.dbg('setTime', { t: 539 }); __cap.skip(5); g.enterFocus(); g.term.go('home'); __cap.skip(1.5, 0.05);`,
    frame: `` },
  { name: 'breaker', frames: 100,
    setup: `__cap.night(6, 120); __cap.skip(5); g.enterFocus(); g.term.go('power'); __cap.skip(1.5, 0.05); const s = g.game.world.actor('starlight'); s.pending = null; s.nextT = 0.6;`,
    frame: `` },
  { name: 'denied', frames: 75,
    setup: `__cap.night(6, 400); __cap.skip(5); g.enterFocus(); g.term.go('map'); __cap.skip(1.5, 0.05); g.game.world.pageLock = { page: 'map', t: 20 }; g.term.triggerGlitch(0.6);`,
    frame: `` },
  { name: 'vent', frames: 120,
    setup: `__cap.night(5, 300); __cap.skip(4); const w = g.game.world; w.office.light = 2; w.dbg('teleport', { id: 'ribbon', node: 'VENT' }); w.actor('ribbon').attackT = 99; g.zoom(0.42); const a = __cap.aim(g.room.vent); __cap.look(a.yaw, a.pitch); __cap.skip(1, 0.1);`,
    frame: `if (i === 50) g.game.cmd('vent', { level: 3 }); if (i === 119) g.zoom(1);` },
  { name: 'thunder', frames: 75,
    setup: `__cap.night(5, 268.5); __cap.skip(1, 0.1); __cap.look(0.35, 0.02);`,
    frame: `__cap.look(0.35 - i * 0.002, 0.02);` },
  { name: 'wind', frames: 110,
    setup: `__cap.night(6, 500); __cap.skip(4); g.game.world.musicBox.wind = 0.25; g.zoom(0.3); const a = __cap.aim(g.room.musicBox.group); __cap.look(a.yaw - 0.03, a.pitch + 0.02); __cap.skip(1, 0.1);`,
    frame: `if (i > 15 && i < 95) g.game.cmd('wind', { dt: 1 / 30, hand: true }); const a = __cap.aim(g.room.musicBox.group); __cap.look(a.yaw - 0.03 - i * 0.0006, a.pitch + 0.02); if (i === 109) g.zoom(1);` },
  { name: 'jumpscare', frames: 72,
    setup: `__cap.night(3, 230); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'pip', node: 'DOOR_R' }); w.actor('pip').attackT = 0.25; __cap.look(-0.3, -0.05);`,
    frame: `` },
  { name: 'n6end', frames: 400,
    setup: `__cap.night(6); const w = g.game.world; for (const t of w.tasks) if (t.id !== 'T-08c') t.done = true; w.dbg('setTime', { t: 539 }); __cap.skip(4); g.enterFocus(); __cap.skip(1, 0.05); g.game.cmd('taskComplete', { id: 'T-08c' });`,
    frame: `` },
  { name: 'dawn', frames: 240,
    setup: `__cap.night(1, 470); __cap.skip(4); __cap.look(0.9, 0); const w = g.game.world; for (const t of w.tasks) t.done = true; w.dbg('setTime', { t: 539.9 });`,
    frame: `` },
  // ---- v2 trailer: scarier, more cinematic shots
  { name: 'reveal', frames: 60,
    setup: `__cap.night(1, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'sunny', node: 'DOOR_L' }); w.actor('sunny').attackT = 99; __cap.look(1.52, 0.0); g.zoom(0.8); __cap.skip(0.5, 0.1);`,
    frame: `if (i === 14) g.game.cmd('doorLight', { side: 'L', on: true }); g.zoom(0.8 - i * 0.004); if (i === 59) g.zoom(1);` },
  { name: 'eyesfar', frames: 120,
    setup: `__cap.night(1, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'sunny', node: '07F' }); w.actor('sunny').timer = 99; __cap.look(1.52, 0.02); g.game.cmd('doorLight', { side: 'L', on: true }); g.zoom(0.95); __cap.skip(0.6, 0.1);`,
    frame: `g.zoom(0.95 - 0.55 * __cap.ease(i / 110)); if (i === 70) { g.game.world.dbg('teleport', { id: 'sunny', node: '07N' }); g.game.world.actor('sunny').timer = 99; } if (i === 119) g.zoom(1);` },
  { name: 'pipstrobe', frames: 75,
    setup: `__cap.night(2, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'pip', node: '08N' }); w.actor('pip').timer = 99; __cap.look(-1.52, 0.0); g.zoom(0.7);`,
    frame: `if (i % 9 === 0) g.game.cmd('doorLight', { side: 'R', on: true }); if (i % 9 === 5) g.game.cmd('doorLight', { side: 'R', on: false }); if (i === 45) { g.game.world.dbg('teleport', { id: 'pip', node: 'DOOR_R' }); g.game.world.actor('pip').attackT = 99; } if (i === 74) g.zoom(1);` },
  { name: 'whip', frames: 60,
    setup: `__cap.night(2, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'sunny', node: 'DOOR_L' }); w.actor('sunny').attackT = 99; w.dbg('teleport', { id: 'pip', node: 'DOOR_R' }); w.actor('pip').attackT = 99; g.game.cmd('doorLight', { side: 'L', on: true }); g.game.cmd('doorLight', { side: 'R', on: true }); __cap.look(-1.55, 0); __cap.skip(0.5, 0.1);`,
    frame: `const w = g.game.world; w.doors.L.heat = 0; w.doors.R.heat = 0; w.actor('sunny').litT = 0; const k = i < 18 ? 0 : i < 26 ? __cap.ease((i - 18) / 8) : i < 40 ? 1 : i < 48 ? 1 - __cap.ease((i - 40) / 8) : 0; __cap.look(-1.55 + 3.1 * k, 0);` },
  { name: 'powerout', frames: 165,
    setup: `__cap.night(1, 400); __cap.skip(4); const w = g.game.world; w.power.reserve = 0.05; w.power.outT = 99; __cap.look(1.42, 0.12); g.zoom(0.75);`,
    frame: `const w = g.game.world; if (w.power.out) w.power.outT = 99; g.zoom(0.75 - i * 0.0015); if (i === 164) g.zoom(1);` },
  { name: 'headturn', frames: 105,
    setup: `__cap.night(6, 500); __cap.skip(4); const w = g.game.world; w.office.light = 1; g.zoom(0.3); const a = __cap.aim(g.room.head); __cap.look(a.yaw, a.pitch); __cap.skip(0.5, 0.1);`,
    frame: `g.room.head.rotation.y = -1.7 + 1.9 * __cap.ease((i - 25) / 40); const a = __cap.aim(g.room.head); __cap.look(a.yaw, a.pitch - 0.01); if (i === 104) g.zoom(1);` },
  { name: 'backdeath', frames: 100,
    setup: `__cap.night(3, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'back', node: 'DOOR_B' }); w.actor('back').attackT = 0.35; __cap.look(-0.15, 0.05);`,
    frame: `` },
  { name: 'jumpsunny', frames: 60,
    setup: `__cap.night(1, 300); __cap.skip(4); const w = g.game.world; w.dbg('teleport', { id: 'sunny', node: 'DOOR_L' }); w.actor('sunny').attackT = 0.2; __cap.look(0.2, -0.05);`,
    frame: `` },
];

export default async (app) => {
  await app.cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await app.waitFor(`document.getElementById('start').classList.contains('ready')`, 60000);
  await app.click(960, 540);
  await app.sleep(1500);
  await app.eval(HELPERS);
  await app.eval(`${G}.capture(true)`);
  console.log('size', await app.eval('[innerWidth, innerHeight]'));
  for (const c of CLIPS) {
    if (ONLY && !ONLY.includes(c.name)) continue;
    const dir = `${ROOT}/${c.name}`;
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    await app.eval(`(() => { const g = ${G}; ${c.setup} })()`);
    for (let i = 0; i < c.frames; i++) {
      if (c.frame) await app.eval(`(() => { const g = ${G}; const i = ${i}; ${c.frame} })()`);
      await app.eval(`${G}.step(1, 1 / 30)`);
      const r = await app.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      (await import('node:fs')).writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(r.data, 'base64'));
    }
    console.log(c.name, c.frames, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
};
