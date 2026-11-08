import * as THREE from 'three';
import { buildRoom } from './scene/room.js';
import { makeComposer } from './scene/post.js';
import { crtCurve } from './scene/crt.js';
import { AudioSys, Buzzer, Phone } from './audio.js';
import { Terminal } from './term/terminal.js';
import { COLS, ROWS, C as TERM_COLORS, strWidth } from './term/screen.js';
import { taskName } from './term/pages/tasks.js';
import { Director } from './director.js';
import { game } from './game.js';
import { save } from './save.js';
import { on } from './bus.js';
import { debugPanel } from './debug/panel.js';
import { ActorViews, NODE_POS } from './scene/actors.js';
import { ROOMS, roomWorldPos } from './rooms.js';
import { native, DEBUG_ALLOWED } from './native.js';

// the game ships as a desktop program only
if (!native) {
  document.getElementById('nobrowser').style.display = 'flex';
  document.getElementById('start').remove();
  throw new Error('NIGHT SHIFT runs in the desktop build only');
}

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.12);

const FOV = 72;
const FOCUS_FOV = 42;
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.02, 40);
camera.rotation.order = 'YXZ';
const EYE = new THREE.Vector3(0, 1.2, 0.35);
camera.position.copy(EYE);
scene.add(camera);

const room = buildRoom(scene);
const { composer, grade, bloom } = makeComposer(renderer, scene, camera);

save.load();

// ------------------------------------------------------------------ audio + terminal
const audio = new AudioSys(camera);
const buzzer = new Buzzer(audio, room.anchors.monitor);
// the phone line comes in through the terminal: it rings at the monitor
const phone = new Phone(audio, room.anchors.monitor);
const term = new Terminal(buzzer);
const termTex = new THREE.CanvasTexture(term.screen.canvas);
termTex.colorSpace = THREE.SRGBColorSpace;
termTex.anisotropy = 8;
termTex.minFilter = THREE.LinearMipmapLinearFilter;
room.makeScreen(termTex);
const crt = room.crtMat;
const director = new Director({ audio, scene, room, term });
const actors = new ActorViews(scene, room);
debugPanel.init();

// ------------------------------------------------------------------ view control
const view = {
  yaw: 0,
  pitch: -0.1,
  yawVel: 0,
  mouse: new THREE.Vector2(0, 0),
  hasMouse: false,
  focus: 1,
  focused: true,
  locked: true,        // menu / report: terminal focus cannot be left
};
const YAW_MAX = 1.78;
const ray = new THREE.Raycaster();
let started = false;
let hoverMonitor = false;
let hoverBox = false;        // the music box on the shelf (Night 6: hold to wind by hand)
let hoverSwitch = null;      // 'L' | 'R': a door light switch
let winding = false;
let windTick = 0;

function screenCell(ndc = view.mouse) {
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(room.screen, false)[0];
  if (!hit || !hit.uv) return null;
  const [u, v] = crtCurve(hit.uv.x, hit.uv.y);
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { x: Math.floor(u * COLS), y: Math.floor((1 - v) * ROWS) };
}

function enterFocus() {
  view.focused = true;
  term.focused = true;
  buzzer.tone(1200, 0.02, 0.3);
  hint.classList.add('hidden');
  if (game.world) game.cmd('focus', { on: true });
}

function exitFocus() {
  if (!view.focused || view.locked) return;
  view.focused = false;
  term.focused = false;
  term.setMouse(null);
  term.mouseUp();
  if (game.world) game.cmd('focus', { on: false });
}

const canvas = renderer.domElement;

// The game always draws its own cursor. In a window the mouse is captured
// (pointer lock) so it cannot wander off while turning; fullscreen needs no
// capture (the screen edge holds it) and so ESC stays a plain key there.
// Chromium releases a lock itself on the ESC key press and eats that press:
// a lock we did not give up counts as ESC; the next click captures again.
const cursorEl = document.getElementById('cursor');
const vm = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let captured = false;
let releasing = false;     // we gave the lock up ourselves (debug panel)
const wantCapture = () => save.data.settings.display !== 'fullscreen';
function setMouse(x, y) {
  vm.x = Math.max(0, Math.min(window.innerWidth - 1, x));
  vm.y = Math.max(0, Math.min(window.innerHeight - 1, y));
  view.mouse.set((vm.x / window.innerWidth) * 2 - 1, -(vm.y / window.innerHeight) * 2 + 1);
  view.hasMouse = true;
  cursorEl.style.transform = `translate(${vm.x}px, ${vm.y}px)`;
}
function capture(e) {
  if (e) setMouse(e.clientX, e.clientY);
  if (captured || !started || debugPanel.open || !wantCapture()) return;
  try {
    canvas.requestPointerLock()?.catch?.(() => {});
  } catch { /* not allowed right now: retry on the next click */ }
}
window.addEventListener('mousemove', (e) => {
  if (captured) setMouse(vm.x + e.movementX, vm.y + e.movementY);
  else setMouse(e.clientX, e.clientY);
});
document.addEventListener('pointerlockchange', () => {
  const was = captured;
  captured = document.pointerLockElement === canvas;
  if (captured) setMouse(vm.x, vm.y);
  else if (was && !releasing && document.hasFocus()) exitFocus();
  releasing = false;
});
// switching to fullscreen: give the mouse back (the screen edge holds it now)
function releaseCapture() {
  if (!captured) return;
  releasing = true;
  document.exitPointerLock();
}
document.addEventListener('mouseleave', (e) => {
  if (captured) return;
  // slid off a side onto another monitor: keep turning that way
  if (e.clientX <= 2 || e.clientX >= window.innerWidth - 3) setMouse(e.clientX <= 2 ? 0 : window.innerWidth, vm.y);
  else view.hasMouse = false;
});
canvas.addEventListener('mousedown', (e) => {
  if (!captured) capture(e);
  // right button leaves the terminal (no contextmenu event under pointer lock)
  if (e.button === 2) {
    exitFocus();
    return;
  }
  if (!started || e.button !== 0) return;
  // 06:00 / death scenes play out without the player
  if (ending && !ending.done) return;
  if (view.focused) {
    const cell = screenCell();
    if (cell) term.mouseDown(cell);
    else exitFocus();
  } else if (hoverMonitor) enterFocus();
  else if (hoverSwitch && game.world) game.cmd('doorLight', { side: hoverSwitch });
  else if (hoverBox && game.world) winding = true;
});
window.addEventListener('mouseup', () => {
  winding = false;
  term.mouseUp();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitFocus();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const focusPos = new THREE.Vector3();
const focusQuat = new THREE.Quaternion();
function computeFocusPose() {
  const s = room.screen;
  const c = new THREE.Vector3();
  s.getWorldPosition(c);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion()));
  const t = Math.tan(THREE.MathUtils.degToRad(FOCUS_FOV / 2));
  const dh = (room.screenSize.h * 1.16) / (2 * t);
  const dw = (room.screenSize.w * 1.12) / (2 * t * camera.aspect);
  focusPos.copy(c).addScaledVector(n, Math.max(dh, dw) + 0.012);
  focusQuat.setFromRotationMatrix(new THREE.Matrix4().lookAt(focusPos, c, new THREE.Vector3(0, 1, 0)));
}

const freeQuat = new THREE.Quaternion();
const freeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const freePos = new THREE.Vector3();
const shake = { amp: 0, t: 0 };
let lastLook = 'F';

function updateCamera(dt, t) {
  const target = view.focused ? 1 : 0;
  view.focus += (target - view.focus) * Math.min(1, dt * 5.5);
  if (Math.abs(target - view.focus) < 0.001) view.focus = target;
  if (view.cinematic) {
    view.yaw += (view.cinematic.yaw - view.yaw) * Math.min(1, dt * (ending && ending.kind !== 'death' ? 2.5 : 14));
    view.pitch += ((view.cinematic.pitch ?? 0.02) - view.pitch) * Math.min(1, dt * (ending && ending.kind !== 'death' ? 2.5 : 14));
    view.yawVel = 0;
  } else if (!view.focused && view.focus < 0.5 && view.hasMouse) {
    const mx = view.mouse.x;
    const dead = 0.32;
    let want = 0;
    const speed = 2.4 * (save.data.settings.turnSpeed || 1);
    if (Math.abs(mx) > dead) want = -Math.sign(mx) * Math.pow((Math.abs(mx) - dead) / (1 - dead), 1.4) * speed;
    view.yawVel += (want - view.yawVel) * Math.min(1, dt * 6);
    view.pitch += (-0.1 + view.mouse.y * 0.28 - view.pitch) * Math.min(1, dt * 3);
  } else view.yawVel *= Math.max(0, 1 - dt * 8);
  view.yaw += view.yawVel * dt;
  if (!view.cinematic && Math.abs(view.yaw) > YAW_MAX) {
    view.yaw = Math.sign(view.yaw) * YAW_MAX;
    view.yawVel = 0;
  }
  // tell the sim where we are looking (used by observation / boss)
  const look = view.focus > 0.5 ? 'F' : view.yaw > 1.0 ? 'L' : view.yaw < -1.0 ? 'R' : 'F';
  if (look !== lastLook && game.world) {
    lastLook = look;
    game.cmd('look', { dir: look });
  }
  const br = Math.sin(t * 1.15);
  freePos.copy(EYE);
  freePos.y += br * 0.006;
  freePos.x += Math.sin(t * 0.37) * 0.01 + Math.sin(-view.yaw) * 0.12 * Math.min(1, Math.abs(view.yaw) / 1.5);
  if (shake.amp > 0) {
    shake.amp = Math.max(0, shake.amp - dt * 2);
    freePos.x += (Math.random() - 0.5) * shake.amp * 0.05;
    freePos.y += (Math.random() - 0.5) * shake.amp * 0.05;
  }
  freeEuler.set(view.pitch + br * 0.004, view.yaw, Math.sin(t * 0.29) * 0.006);
  freeQuat.setFromEuler(freeEuler);
  computeFocusPose();
  const e = view.focus * view.focus * (3 - 2 * view.focus);
  camera.position.lerpVectors(freePos, focusPos, e);
  camera.quaternion.slerpQuaternions(freeQuat, focusQuat, e);
  const fov = (FOV + (FOCUS_FOV - FOV) * e) * fovScale;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  grade.uniforms.focus.value = e;
  bloom.strength = 0.45 - 0.22 * e;
}

// ------------------------------------------------------------------ flow
const startEl = document.getElementById('start');
const hint = document.getElementById('hint');
const intro = document.getElementById('intro');
const loadEl = document.getElementById('load');
const subtitle = document.getElementById('subtitle');

function lockFocus() {
  view.locked = true;
  view.focused = true;
  term.focused = true;
}

function clearEnding() {
  ending = null;
  blackout = false;
  grade.uniforms.dark.value = 0;
  intro.classList.remove('show', 'boss');
  subtitle.classList.remove('show', 'starlight');
}

function showMenu() {
  view.cinematic = null;
  actors.clearJumpscare();
  scare = null;
  game.toMenu();
  lockFocus();
  phone.stop();
  clearEnding();
  hint.classList.add('hidden');
  term.showMenu();
}

let ending = null; // { kind, t }
let blackout = false; // force the office lamp off (back-door death)
const calm = () => !!save.data.settings.reduceFlicker;
let powerOutT = 0;
// two eyes in the left doorway when the power is gone
const outEyes = (() => {
  const g = new THREE.SphereGeometry(0.022, 10, 8);
  const m = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const grp = new THREE.Group();
  for (const dz of [-0.08, 0.08]) {
    const e = new THREE.Mesh(g, m);
    e.position.set(0, 0, dz);
    grp.add(e);
  }
  grp.position.set(-3.1, 1.72, 0.1);
  grp.visible = false;
  scene.add(grp);
  return { material: m, set visible(v) { grp.visible = v; } };
})();
let scare = null;

// a short ringing in the ears after a scare
function tinnitus() {
  const ctx = audio.ctx;
  const o = ctx.createOscillator();
  o.frequency.value = 6200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime + 0.5);
  g.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.7);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 3.2);
  o.connect(g);
  g.connect(audio.listener.getInput());
  o.start();
  o.stop(ctx.currentTime + 3.3);
}

let introTimer = null;
let hintTimers = [];
function startNight(n, debug, replay) {
  debug = debug && DEBUG_ALLOWED;
  phone.stop();
  clearEnding();
  game.start(n, { debug, seed: replay?.seed, replay: replay?.commands });
  lastLook = 'F';
  winding = false;
  view.locked = false;
  view.focused = false;
  term.focused = false;
  view.yaw = 0;
  view.cinematic = null;
  actors.clearJumpscare();
  scare = null;
  blackout = false;
  term.startNight();
  intro.querySelector('.t').textContent = n === 0 ? 'TEST' : '12:00 AM';
  intro.querySelector('.n').textContent = game.nightName(n);
  intro.classList.add('show');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => {
    // (unless a 06:00 scene has taken the overlay over)
    if (!(ending && ending.shown)) intro.classList.remove('show');
  }, 3200);
  hint.classList.add('hidden');
  for (const h of hintTimers) clearTimeout(h);
  hintTimers = [];
  if (n === 1 && !game.debug) {
    const night = game.world;
    hintTimers.push(setTimeout(() => game.world === night && !night.result && hint.classList.remove('hidden'), 3600));
    hintTimers.push(setTimeout(() => hint.classList.add('hidden'), 14000));
  }
}

term.actions = {
  start: (n, debug) => startNight(n, debug),
  menu: () => showMenu(),
  backfire: () => game.cmd('backfire'),
};

// replays exported from the debug panel (or the balance tools)
debugPanel.onReplay = (data) => startNight(data.night, true, data);

// ------------------------------------------------------------------ sim events -> presentation
// nuisance calls ring at the terminal; the ☎ button on the status bar ends them
on('sim:phone', (e) => {
  if (e.state === 'ringing') {
    phone.ring(2);
    ringTimer = 3;
  } else phone.stop();
});
let ringTimer = 0;

on('sim:doorLight', (e) => {
  if (e.on) {
    doorStrike[e.side] = 0.35;
    audio.shot('relay', room.doorLights[e.side].anchor.position, { scene, volume: 0.9, ref: 1 });
  } else audio.shot('relay', room.doorLights[e.side].anchor.position, { scene, volume: 0.7, ref: 1, rate: 1.15 });
});
on('sim:bulbBurn', (e) => {
  audio.shot('zap', room.doorLights[e.side].anchor.position, { scene, volume: 1.2, ref: 1.5, rate: 1.4 });
  audio.shot('relay', room.doorLights[e.side].anchor.position, { scene, volume: 1.0, ref: 1, rate: 0.7 });
  sparks[e.side] = 0.6;
  buzzer.error();
});
on('sim:trip', () => {
  audio.shot('thud', room.anchors.lamp.position, { scene, volume: 1.0, ref: 2 });
  shake.amp = 0.5;
  buzzer.error();
});
on('sim:degauss', () => {
  degauss = 1;
  audio.shot('thud', room.anchors.monitor.position, { scene, volume: 0.7, ref: 0.6, rate: 1.6 });
  audio.shot('buzz', room.anchors.monitor.position, { scene, volume: 0.4, ref: 0.6, rate: 2 });
});
on('sim:breaker', (e) => {
  if (e.auto) audio.shot('relay', room.anchors.monitor.position, { scene, volume: 0.4, ref: 1, rate: 0.8 });
});
on('sim:emergency', () => {
  buzzer.tone(1400, 0.08, 0.6);
  buzzer.tone(1400, 0.08, 0.6, null, 0.15);
  buzzer.tone(1400, 0.08, 0.6, null, 0.3);
});
on('sim:hour', () => buzzer.tone(2000, 0.05, 0.4));
// Night 6, 06:00 with the takeback unfinished: the clock stops at 05:59
on('sim:clockStuck', () => {
  buzzer.error();
  shake.amp = 0.25;
  term.triggerGlitch(0.5);
  audio.shot('bell6', room.anchors.monitor.position, { scene, volume: 0.8, ref: 2, rate: 0.5 });
});
// --- animatronic sounds, positioned where the sim says they are
const CUE_SOUND = {
  sunny: { step: ['step_heavy', 1], greet: ['greet_sunny', 1] },
  pip: { step: ['step_light', 1], greet: ['greet_pip', 1] },
  tootie: { step: ['step_light', 1.35], greet: ['horn', 1] },
  chef: { step: ['step_heavy', 0.7], greet: ['greet_sunny', 0.7], wake: ['clank', 0.8] },
  back: { step: ['back_drag', 1], greet: ['back_scratch', 1] },
  ribbon: { step: ['duct', 1], greet: ['duct', 0.7] },
  generator: { bang: ['thunder', 2.2] },
};
on('sim:cue', (e) => {
  actors.event(e);
  const def = CUE_SOUND[e.source]?.[e.kind];
  const pos = NODE_POS[e.node];
  if (!def || !pos) return;
  const v = new THREE.Vector3(...pos);
  const far = v.length() > 6;
  // the cue's loudness comes from the sim (dB); distance mostly colours it
  // (low-pass) rather than burying it, so what the sim says you can hear,
  // you can actually hear over the fan
  const vol = Math.min(3, 1.6 * Math.pow(10, (e.db - 44) / 20));
  audio.shot(def[0], v, { scene, volume: vol, ref: far ? 6 : 3, lowpass: far ? 1800 : 0, rate: def[1] * (0.95 + Math.random() * 0.1) });
  // at the back door it also "breathes"
  if (e.source === 'back' && e.kind === 'greet') audio.shot('back_breath', v, { scene, volume: vol * 0.8, ref: 1.2 });
});
on('sim:repel', (e) => {
  actors.event(e);
  const side = e.side === 'L' ? NODE_POS.DOOR_L : NODE_POS.DOOR_R;
  audio.shot('servo', new THREE.Vector3(...side), { scene, volume: 0.8, ref: 1.5, rate: 0.8 });
  const w0 = game.world;
  if (e.actor === 'sunny') setTimeout(() => game.world === w0 && !w0.result && audio.shot('step_heavy', new THREE.Vector3(-6, 1, 0), { scene, volume: 0.8, ref: 2 }), 900);
});
on('sim:telegraph', (e) => {
  if (e.kind === 'pose') audio.shot('servo', new THREE.Vector3(...NODE_POS.DOOR_R), { scene, volume: 0.7, ref: 1.5, rate: 1.3 });
  if (e.kind === 'wake') audio.shot('horn', new THREE.Vector3(...NODE_POS['13']), { scene, volume: 1.6, ref: 3, lowpass: 1600, rate: 0.85 });
});
const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
on('sim:seal', (e) => {
  const r = ROOM_BY_ID[e.room];
  if (!r) return;
  const p = roomWorldPos(r);
  audio.shot('shutter', new THREE.Vector3(p.x, 1.5, p.z), { scene, volume: 1.4, ref: 3, lowpass: 1500, rate: e.on ? 1 : 1.3 });
});

on('sim:gridFail', () => {
  audio.shot('thunder', new THREE.Vector3(-6, 6, -10), { scene, volume: 2.5, ref: 6 });
  director.flicker = 1.6;
  shake.amp = 0.6;
  term.triggerGlitch(0.4);
});
on('sim:generator', (e) => {
  if (e.running) audio.shot('thud', new THREE.Vector3(...NODE_POS['10']), { scene, volume: 2, ref: 3, lowpass: 600 });
});

// --- STARLIGHT
on('sim:bossPhase', (e) => {
  term.triggerGlitch(0.6);
  shake.amp = 0.3;
  audio.shot('thud', room.anchors.monitor.position, { scene, volume: 1.2, ref: 1, rate: 0.5 });
  buzzer.tone(110, 0.6, 0.6);
});
on('sim:bossTelegraph', (e) => {
  if (e.kind === 'pa') {
    // the PA speakers crackle in the halls: 3 s until the lures go dead
    for (const n of ['07F', '08F']) audio.shot('zap', new THREE.Vector3(...NODE_POS[n]), { scene, volume: 1.0, ref: 3, lowpass: 2000, rate: 0.6 });
    buzzer.tone(660, 0.2, 0.35, 440);
  } else if (e.kind === 'breaker') {
    const w0 = game.world;
    for (let i = 0; i < 6; i++) setTimeout(() => game.world === w0 && !w0.result && audio.shot('relay', new THREE.Vector3(...NODE_POS['10']), { scene, volume: 0.9, ref: 2, rate: 0.8 + Math.random() * 0.6 }), i * 300);
    buzzer.tone(330, 0.3, 0.5, 220);
  } else if (e.kind === 'attack') {
    const p = e.side === 'L' ? NODE_POS['07N'] : e.side === 'R' ? NODE_POS['08N'] : NODE_POS['12'];
    audio.shot('horn', new THREE.Vector3(...p), { scene, volume: 1.4, ref: 2, rate: 0.55 });
  }
});
on('sim:paJam', () => {
  // the PA squeals as it is taken over
  for (const id of ['08', '07', '02']) audio.shot('horn', new THREE.Vector3(...NODE_POS[id === '07' ? '07F' : id === '08' ? '08F' : id]), { scene, volume: 0.7, ref: 3, rate: 0.35 + Math.random() * 0.1, lowpass: 1400 });
  buzzer.tone(880, 0.25, 0.4, 1320);
  term.triggerGlitch(0.3);
});
on('sim:pageLock', () => {
  term.triggerGlitch(0.5);
  buzzer.error();
});

on('sim:powerOut', () => {
  audio.shot('thud', room.anchors.lamp.position, { scene, volume: 1.2, ref: 2, rate: 0.7 });
});

// where the free camera has to turn to look at an object in the room
function aimAt(obj) {
  const p = obj.getWorldPosition(new THREE.Vector3());
  const dx = p.x - EYE.x;
  const dz = p.z - EYE.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(p.y - EYE.y, Math.hypot(dx, dz)) };
}

function ringBell(rate = 1, volume = 1) {
  audio.shot('bell6', room.anchors.monitor.position, { scene, volume, ref: 2, rate });
}

// what the terminal prints when the camera moves back in at 06:00. This is
// the only place the endings differ (passed / checklist unfinished / Night 6).
function shiftEndLines(w, kind, outcome) {
  const C = TERM_COLORS;
  if (kind === 'bossWin') {
    return [
      ['STARLIGHT SYSTEMS BIOS  v1.07   (C) 1989-1993', C.hi],
      ['', 0],
      ['SECOS> 扫描进程表 ...', C.fg],
      ['  STARLIGHT.EXE ............ 未授权进程', C.red],
      ['SECOS> 正在删除 STARLIGHT.EXE', C.fg],
      ['  ████████████████████████ 100%', C.cy],
      ['  STARLIGHT.EXE 已删除.', C.ok],
      ['', 0],
      [`06:00 AM    班次结束 · ${game.nightName(6)}`, C.yel],
      ['>> 所有系统已归还. 天亮了.', C.ok],
    ];
  }
  const lines = [
    ['C:\\SEC> SHIFTEND.EXE', C.hi],
    ['', 0],
    [`06:00 AM    班次结束 · ${game.nightName(game.night)}`, C.yel],
    ['核对交班清单 ...', C.fg],
  ];
  for (const t of w.tasks.filter((x) => !x.optional)) {
    const label = `  ${t.id} ${taskName(t.id)}`;
    lines.push([`${label} ${'.'.repeat(Math.max(2, 32 - strWidth(label)))} ${t.done ? '√ 完成' : '× 未完成'}`, t.done ? C.ok : C.red]);
  }
  if (!w.tasks.some((x) => !x.optional)) lines.push(['  (今晚没有任务)', C.dim]);
  lines.push(['', 0]);
  if (outcome === 'win') lines.push(['>> 交班清单完成. 白班已到岗, 辛苦了.', C.ok]);
  else lines.push(['>> 交班清单未完成 — 本夜考核未通过.', C.red], ['>> 这一夜需要重新值班.', C.red]);
  return lines;
}

on('nightEnd', ({ result }) => {
  phone.stop();
  winding = false;
  hint.classList.add('hidden');
  subtitle.classList.remove('show');
  ending = { kind: result.outcome, t: 0 };
  if (result.outcome === 'death' && result.cause === 'back') {
    // it never shows itself: the door behind you opens, the light dies
    ending.backDeath = true;
    audio.shot('creak', new THREE.Vector3(0, 1.2, 2.3), { scene, volume: 2.2, ref: 1, rate: 0.7 });
    audio.shot('wind_gust', new THREE.Vector3(0, 1.2, 2.0), { scene, volume: 1.6, ref: 1.5 });
    const end0 = ending;
    setTimeout(() => {
      if (ending === end0) audio.shot('back_breath', new THREE.Vector3(0.1, 1.25, 0.75), { scene, volume: 2.5, ref: 0.6 });
    }, 700);
    shake.amp = 0.4;
  } else if (result.outcome === 'death') {
    const who = actors.views[result.cause] ? result.cause : 'sunny';
    const side = result.side || (who === 'sunny' ? 'L' : 'R');
    // snap the view to the door it came from, then it lunges
    view.locked = false;
    view.focused = false;
    term.focused = false;
    view.cinematic = { yaw: side === 'L' ? 1.5 : -1.5 };
    ending.scareAt = 0.35;
    ending.who = who;
  } else {
    // 06:00: the shift is over. Nights 1-5 share one short scene (the
    // terminal says whether the checklist passed); Night 6 has its own.
    const boss = game.night === 6 && result.outcome === 'win';
    ending.kind = boss ? 'bossWin' : 'dawn';
    ending.outcome = result.outcome;
    ending.bells = 0;
    ending.lines = shiftEndLines(game.world, ending.kind, result.outcome);
    const lamp = game.world.powered('C1') && !game.world.power.out ? [0, 0.35, 1][game.world.office.light] : 0;
    ending.lights = { lamp, L: 0, R: 0, dawn: 0, duck: 1 };
    // the player lets go: out of the terminal, the camera is driven from here
    view.locked = true;
    view.focused = false;
    term.focused = false;
    term.setMouse(null);
    term.mouseUp();
    view.cinematic = boss ? aimAt(room.head) : { yaw: 0, pitch: 0.06 };
    if (boss) {
      // STARLIGHT does not go quietly
      term.triggerGlitch(2.6);
      shake.amp = 0.6;
      buzzer.tone(440, 1.2, 0.5, 55);
      audio.shot('thud', room.anchors.monitor.position, { scene, volume: 1.4, ref: 1, rate: 0.4 });
    }
  }
});

function setIntro(t, n, boss = false) {
  intro.querySelector('.t').textContent = t;
  intro.querySelector('.n').textContent = n;
  intro.classList.toggle('boss', boss);
  intro.classList.add('show');
}

function zoomToTerminal() {
  intro.classList.remove('show');
  view.cinematic = null;
  lockFocus();
  term.showShiftEnd(ending.lines);
  ending.zoomAt = ending.t;
}

const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

// Nights 1-5 at 06:00: six bells, the clock rolls over, the lights come up,
// the camera goes back to the terminal for the verdict (about 8 s)
function updateDawn(dt) {
  const T = ending.t;
  const L = ending.lights;
  while (ending.bells < 6 && T >= 0.3 + ending.bells * 0.6) {
    ringBell();
    ending.bells++;
  }
  if (!ending.shown && T >= 0.15) {
    ending.shown = true;
    setIntro('5:59 AM', game.nightName(game.night));
  }
  if (!ending.flipped && T >= 0.9) {
    ending.flipped = true;
    setIntro('6:00 AM', game.nightName(game.night));
    buzzer.tone(2000, 0.05, 0.4);
  }
  L.lamp = Math.max(L.lamp, ramp(T, 0.8, 2.2));
  L.dawn = ramp(T, 0.5, 4);
  if (!ending.zoomAt && T >= 3.6) zoomToTerminal();
  if (ending.zoomAt && T >= ending.zoomAt + term.shiftEndDuration() + 1.4) finishEnding();
}

// Night 6 won: STARLIGHT's last moment, a dead silent blackout, the music
// box on the shelf plays on its own, 05:59 rolls to 06:00, the lights come
// back one by one and the terminal boots clean (about 15 s)
function updateBossWin(dt) {
  const T = ending.t;
  const L = ending.lights;
  const CUT = 2.8;
  if (T < CUT) {
    term.triggerGlitch(0.2);
    director.flicker = 0.3;
    if (!ending.said1 && T >= 0.4) {
      ending.said1 = true;
      subtitle.textContent = '…… 不.';
      subtitle.classList.add('show', 'starlight');
    }
    if (!ending.said2 && T >= 1.5) {
      ending.said2 = true;
      subtitle.textContent = '你 关 不 掉 我 ……';
    }
  } else if (!ending.cut) {
    // everything dies at once
    ending.cut = true;
    subtitle.classList.remove('show', 'starlight');
    blackout = true;
    term.mode = 'dead';
    L.lamp = 0;
    L.duck = 0.08;
    director.flicker = 0;
    shake.amp = 0.8;
    audio.shot('thud', room.anchors.lamp.position, { scene, volume: 1.6, ref: 2, rate: 0.6 });
    audio.shot('zap', room.anchors.monitor.position, { scene, volume: 1.2, ref: 1, rate: 0.5 });
  }
  if (!ending.boxOn && T >= 4.4) {
    ending.boxOn = true;
    view.cinematic = aimAt(room.musicBox.group);
  }
  if (!ending.shown && T >= 5.0) {
    ending.shown = true;
    setIntro('05:59', '', true);
  }
  if (!ending.flipped && T >= 6.6) {
    ending.flipped = true;
    setIntro('6:00 AM', game.nightName(6));
    shake.amp = 0.2;
  }
  while (ending.flipped && ending.bells < 6 && T >= 6.6 + ending.bells * 0.8) {
    ringBell(ending.bells === 0 ? 0.9 : 1);
    ending.bells++;
  }
  // the lights come back one by one
  const relay = (key, at, pos) => {
    if (ending[key] || T < at) return false;
    ending[key] = true;
    audio.shot('relay', pos, { scene, volume: 1, ref: 1 });
    return true;
  };
  if (relay('lit1', 7.2, room.doorLights.L.anchor.position)) L.L = 1;
  if (relay('lit2', 7.8, room.doorLights.R.anchor.position)) L.R = 1;
  if (relay('lit3', 8.5, room.anchors.lamp.position)) blackout = false;
  if (ending.lit3) L.lamp = ramp(T, 8.5, 9.4);
  if (T >= 9.6) {
    L.L = Math.max(0, 1 - ramp(T, 9.6, 10.6));
    L.R = L.L;
  }
  L.dawn = ramp(T, 8.5, 12);
  L.duck = T < 6.6 ? L.duck : Math.min(1, 0.08 + ramp(T, 6.6, 10));
  if (!ending.zoomAt && T >= 10.8) zoomToTerminal();
  if (ending.zoomAt && T >= ending.zoomAt + term.shiftEndDuration() + 1.8) finishEnding();
}

function finishEnding() {
  ending.done = true;
  grade.uniforms.dark.value = 0;
  view.cinematic = null;
  actors.clearJumpscare();
  scare = null;
  intro.classList.remove('show', 'boss');
  subtitle.classList.remove('show', 'starlight');
  lockFocus();
  term.showResult();
}

function updateEnding(dt) {
  if (!ending || ending.done) return;
  ending.t += dt;
  const k = ending.kind;
  if (k === 'dawn') return updateDawn(dt);
  if (k === 'bossWin') return updateBossWin(dt);
  if (k === 'death' && ending.backDeath) {
    // the lamp sputters out, then nothing
    director.flicker = ending.t < 1.2 ? 1 : 0;
    blackout = ending.t > 1.2;
    grade.uniforms.dark.value = ending.t > 2.2 ? Math.min(1, (ending.t - 2.2) * 2) : 0;
  } else if (k === 'death') {
    if (ending.scareAt !== undefined && ending.t >= ending.scareAt && !scare) {
      scare = actors.jumpscare(ending.who, camera);
      audio.shot('scream', camera.position, { scene, volume: 1.6, ref: 1 });
      shake.amp = 2.5;
      tinnitus();
    }
    actors.updateJumpscare(dt, scare);
    grade.uniforms.dark.value = ending.t > 1.4 ? Math.min(1, (ending.t - 1.4) * 4) : 0;
  }
  if (ending.t > 2.6 && term.mode !== 'result') {
    blackout = false;
    finishEnding();
  }
}

// ------------------------------------------------------------------ world -> 3D / audio
const loops = {};
const headGlow = new THREE.PointLight(0xff2010, 0, 2.6, 1.6);
headGlow.position.set(0, 0.05, 0.25);
room.head.add(headGlow);
const doorStrike = { L: 0, R: 0 };
const sparks = { L: 0, R: 0 };
let degauss = 0;
const MENU = { light: 2, fan: true, osc: true, vent: 1, music: true, wind: 1, doors: { L: false, R: false }, heat: { L: 0, R: 0 } };

function startAudio() {
  loops.ambience = audio.loop('ambience', { volume: 0.24, music: true });
  loops.room = audio.loop('roomtone', { volume: 0.22 });
  loops.fan = audio.loop('fan', { parent: room.anchors.fan, volume: 0.38, ref: 0.6, rolloff: 1.1 });
  loops.lamp = audio.loop('buzz', { parent: room.anchors.lamp, volume: 0.05, ref: 0.8 });
  loops.doorL = audio.loop('buzz', { parent: room.doorLights.L.anchor, volume: 0, ref: 1, rate: 0.98 });
  loops.doorR = audio.loop('buzz', { parent: room.doorLights.R.anchor, volume: 0, ref: 1, rate: 1.02 });
  loops.tension = audio.loop('tension', { volume: 0 });
  const genAnchor = new THREE.Object3D();
  genAnchor.position.set(...NODE_POS['10']);
  scene.add(genAnchor);
  loops.gen = audio.loop('generator', { parent: genAnchor, volume: 0, ref: 3, lowpass: 900 });
  loops.heart = audio.loop('heartbeat', { volume: 0 });
  // power-out: a slow tune outside the left door
  const outAnchor = new THREE.Object3D();
  outAnchor.position.set(-3.6, 1.6, 0.1);
  scene.add(outAnchor);
  loops.outTune = audio.loop('musicbox', { parent: outAnchor, volume: 0, ref: 2, lowpass: 1600, rate: 0.66 });
  const mbAnchor = new THREE.Object3D();
  mbAnchor.position.set(11, 1.4, 5);
  scene.add(mbAnchor);
  loops.music = audio.loop('musicbox', { parent: mbAnchor, volume: 0, ref: 3.5, rolloff: 0.9, lowpass: 2400, offset: 0 });
  loops.boxLocal = audio.loop('musicbox', { parent: room.musicBox.group, volume: 0, ref: 0.8, offset: 0 });
}

function updateWorld(dt, t) {
  const w = game.world;
  const st = w
    ? {
      light: w.powered('C1') ? w.office.light : 0,
      fan: w.powered('C5') && w.office.fan,
      osc: w.office.oscillate,
      vent: w.powered('C4') ? w.office.vent : 0,
      music: w.musicPlaying(),
      wind: w.musicBox.wind,
      doors: { L: w.doorLit('L'), R: w.doorLit('R') },
      heat: { L: w.doors.L.heat, R: w.doors.R.heat },
      out: w.power.out || w.power.tripped,
    }
    : MENU;

  // fan
  const f = room.fan;
  // (Night 6 won: the power dies for a moment and the fan winds down)
  const fanOn = st.fan && !(ending && ending.kind === 'bossWin' && ending.cut && !ending.lit3);
  f.speed += ((fanOn ? 26 : 0) - f.speed) * dt * (fanOn ? 0.9 : 0.35);
  f.blades.rotation.z -= f.speed * dt;
  if (st.osc && f.speed > 1) f.osc = (f.osc || 0) + dt * 0.45 * (f.speed / 26);
  f.head.rotation.y = Math.sin(f.osc || 0) * 0.65;
  if (loops.fan) {
    loops.fan.setVolume(0.4 * Math.min(1, f.speed / 26));
    loops.fan.setPlaybackRate(0.55 + 0.45 * Math.min(1, f.speed / 26));
  }

  // office lamp
  const EL = ending && ending.lights;
  const lv = EL ? (blackout ? 0 : EL.lamp) : blackout ? 0 : [0, 0.35, 1][st.light];
  // reduced flashing: a steady dip instead of a strobe
  const fl = calm() ? (director.flicker > 0 ? 0.8 : 1) : director.lampFlicker(t);
  const L = room.lamp;
  L.spot.intensity = L.base.spot * lv * fl;
  L.fill.intensity = L.base.fill * lv * fl;
  L.bulbMat.emissiveIntensity = L.base.emissive * lv * fl + 0.02;
  L.group.rotation.z = Math.sin(t * 0.55) * 0.012;
  L.group.rotation.x = Math.sin(t * 0.41) * 0.008;
  if (loops.lamp) loops.lamp.setVolume(0.06 * lv * fl);

  // door lights: strike, overheat flicker, sparks
  for (const k of ['L', 'R']) {
    const D = room.doorLights[k];
    let lvl = 0;
    if (EL) lvl = EL[k];
    else if (st.doors[k]) {
      if (doorStrike[k] > 0) {
        doorStrike[k] -= dt;
        lvl = calm() ? 0.7 : Math.random() < 0.5 ? 0 : 0.7;
      } else {
        const hot = st.heat[k] > 75;
        lvl = calm() ? (hot ? 0.85 : 1) : Math.random() < (hot ? 0.12 : 0.006) ? 0.3 : 1;
      }
    }
    const warm = Math.min(1, Math.max(0, (st.heat[k] - 50) / 50));
    D.spot.color.setRGB(0.85 + warm * 0.15, 0.89 - warm * 0.15, 1.0 - warm * 0.45);
    D.spot.intensity = 32 * lvl;
    D.spill.intensity = 2.2 * lvl;
    D.bulbMat.emissiveIntensity = 4 * lvl;
    if (sparks[k] > 0) {
      sparks[k] -= dt;
      D.spill.intensity = calm() ? 1.5 : Math.random() < 0.5 ? 3 : 0;
      D.spill.color.setHex(0xffc070);
    } else D.spill.color.setHex(0xd8e4ff);
    room.panelLeds[k].emissive.setHex(st.doors[k] || lvl > 0.5 ? 0x30ff60 : 0xff3020);
    const sw = room.doorSwitches[k].btnMat;
    sw.emissive.setHex(st.doors[k] ? 0x30ff60 : 0xff3020);
    sw.emissiveIntensity = st.doors[k] ? 0.9 : hoverSwitch === k ? 0.7 : 0.3;
    room.panelLeds[k].emissiveIntensity = st.doors[k] ? 2.2 : 0.6;
    const lp = k === 'L' ? loops.doorL : loops.doorR;
    if (lp) lp.setVolume(st.doors[k] || lvl > 0 ? 0.3 * Math.max(0.3, lvl) : 0);
  }
  // 06:00: grey morning light creeps in
  {
    const dawn = EL ? EL.dawn : 0;
    room.hemi.intensity = 0.16 + dawn * 0.9 * (blackout ? 0.1 : 1);
    room.hemi.color.setRGB(0.165 + dawn * 0.75, 0.21 + dawn * 0.62, 0.31 + dawn * 0.45);
  }

  // animatronics in the corridors; dust in the beams
  const lightLevel = { L: room.doorLights.L.spot.intensity / 32, R: room.doorLights.R.spot.intensity / 32 };
  for (const k of ['L', 'R']) {
    const du = room.doorLights[k].dust.material.uniforms;
    du.level.value = lightLevel[k];
    du.time.value = t;
  }
  actors.ghosts = game.debug && debugPanel.ghosts;
  // debug ghosts draw through walls: keep them off the CRT while it is in use
  actors.ghostsHidden = view.focused;
  if (!scare) actors.update(dt, t, w && !w.result ? w : null, lightLevel);

  // tension: how close is anything?
  let tension = 0;
  let atDoor = 0;
  if (w && !w.result) {
    for (const a of w.actors) {
      const n = a.node;
      const v = n.startsWith('DOOR') || n === 'VENT' ? 1 : /N$|^12$|^D2$/.test(n) ? 0.6 : /F$|^11$|^BACKP$|^D1$/.test(n) ? 0.3 : a.state === 'rush' ? 0.7 : 0;
      tension = Math.max(tension, v);
      if (v === 1) atDoor = 1;
    }
  }
  view.tension = (view.tension || 0) + (tension - (view.tension || 0)) * Math.min(1, dt * 0.8);
  if (loops.tension) loops.tension.setVolume(view.tension * 0.45);
  if (loops.heart) {
    const hv = loops.heart.getVolume();
    loops.heart.setVolume(hv + (atDoor * 0.55 - hv) * Math.min(1, dt * 2));
    loops.heart.setPlaybackRate(1 + view.tension * 0.5);
  }
  // (the picture never reacts to what is out there: no tension vignette)
  grade.uniforms.vignette.value = 1.15;

  // CRT: power, EMI, magnetisation, degauss, heat
  // the result screens run on the backup line even after a blackout
  const termOn = started && term.mode !== 'dead' && (!w || !w.power.out || ['result', 'shiftEnd', 'menu'].includes(term.mode));
  const pu = crt.uniforms.power;
  pu.value = termOn ? Math.min(1, pu.value + dt * 0.8) : Math.max(0, pu.value - dt * 1.6);
  if (w && !w.result) {
    crt.uniforms.magnet.value = w.emi.magnet * 0.8;
    crt.uniforms.heat.value = Math.max(0, w.temp.eff - 30) / 6;
  } else {
    crt.uniforms.magnet.value = 0;
    crt.uniforms.heat.value = 0;
  }
  degauss = Math.max(0, degauss - dt * 1.1);
  crt.uniforms.degauss.value = degauss;
  crt.uniforms.bright.value = 0.88 * (save.data.settings.crtIntensity ?? 1) + 0.2 * (1 - (save.data.settings.crtIntensity ?? 1));
  room.screenLight.intensity = 9 * pu.value * (0.95 + Math.random() * 0.05) * (term.glitch > 0 ? 0.6 + Math.random() * 0.6 : 1);
  room.monitorLed.emissiveIntensity = termOn ? 2 : 0;

  // a nuisance call rings in bursts until it is ended on the terminal
  if (w && !w.result && w.phone.state === 'ringing') {
    ringTimer -= dt;
    if (ringTimer <= 0) {
      phone.ring(1.6);
      ringTimer = 3;
    }
  }

  room.clockSecond.rotation.z = -(Math.floor(t) % 2 ? 0.105 : 0);

  // N6: the terminal turns red phase by phase; the head on the shelf wakes up
  const boss = w && w.actor('starlight');
  const ph = boss ? boss.phase : 0;
  const bossEnd = ending && ending.kind === 'bossWin' ? ending : null;
  let red = boss && !w.result ? [0, 0.2, 0.4, 0.65, 0.9][ph] : 0;
  // its last seconds: the screen burns red, then it is gone
  if (bossEnd && !bossEnd.cut) red = calm() ? 0.9 : 0.75 + Math.random() * 0.25;
  crt.uniforms.tint.value.set(1 + red * 0.5, 1 - red * 0.55, 1 - red * 0.6);
  room.screenLight.color.setRGB(0.36 + red * 0.6, 0.49 - red * 0.35, 1 - red * 0.75);
  // its eyes light the shelf red in its last seconds
  headGlow.intensity = bossEnd && !bossEnd.cut ? (calm() ? 2.2 : 1.6 + Math.random() * 1.6) : 0;
  if (room.headPupil) {
    let pupil = boss ? 0.15 + ph * 0.8 + (ph === 4 && !calm() ? Math.sin(t * 9) * 0.6 : 0) : 0.15;
    if (bossEnd) pupil = bossEnd.cut ? 0 : 3.5 + (calm() ? 0 : Math.random() * 3);
    room.headPupil.emissiveIntensity = pupil;
  }
  if (room.head && boss) {
    let want = ph === 4 ? (view.yaw > 0.8 ? 0.4 : view.yaw < -0.8 ? -1.6 : -0.6) : -0.6;
    // at the end it stares straight at you, then sags on the shelf
    if (bossEnd) want = 0.2;
    room.head.rotation.y += (want - room.head.rotation.y) * Math.min(1, dt * 2);
    const droop = bossEnd && bossEnd.cut ? 0.35 : 0;
    room.head.rotation.x += (droop - room.head.rotation.x) * Math.min(1, dt * 1.5);
  } else if (room.head) room.head.rotation.x = 0;

  // power out: the tune, then eyes in the left doorway
  const outNow = !!(w && w.power.out && !w.result);
  powerOutT = outNow ? powerOutT + dt : 0;
  if (loops.outTune) {
    const want = outNow && powerOutT > 1.5 ? 0.9 : 0;
    const cur = loops.outTune.getVolume();
    loops.outTune.setVolume(cur + (want - cur) * Math.min(1, dt * (want ? 0.8 : 6)));
    loops.outTune.setPlaybackRate(0.64 + Math.sin(t * 0.7) * 0.02);
  }
  outEyes.material.opacity = outNow && powerOutT > 3 ? (Math.sin(t * 1.3) > -0.85 ? 0.9 : 0) * Math.min(1, (powerOutT - 3) * 0.6) : 0;
  outEyes.visible = outEyes.material.opacity > 0.01;

  // music box
  // Night 6 won: the box plays on its own in the dark, clean and at full speed
  const boxSolo = bossEnd && bossEnd.boxOn;
  if (room.musicBox) {
    const mb = room.musicBox;
    const speed = boxSolo ? 1 : bossEnd ? 0.3 : st.music ? 0.82 + 0.18 * Math.min(1, st.wind * 3) : 0;
    mb.dancer.rotation.y += dt * 2.2 * speed;
    // the key turns with the spring: winding spins it one way, playing lets it creep back
    mb.key.rotation.x = (st.wind ?? 1) * 40;
  }
  if (loops.music) {
    const vol = bossEnd ? 0 : st.music ? 0.55 : 0;
    const cur = loops.music.getVolume();
    loops.music.setVolume(cur + (vol - cur) * Math.min(1, dt * 3));
    loops.music.setPlaybackRate(0.82 + 0.18 * Math.min(1, st.wind * 3));
  }
  // the box right in front of you (Night 6: wound by hand, and its solo)
  if (loops.boxLocal) {
    const hand = w && !w.result && w.musicBox.hand && st.music;
    const vol = boxSolo ? 0.9 : bossEnd && !bossEnd.cut ? 0.35 : hand ? 0.1 : 0;
    const cur = loops.boxLocal.getVolume();
    loops.boxLocal.setVolume(cur + (vol - cur) * Math.min(1, dt * (boxSolo ? 0.7 : 3)));
    loops.boxLocal.setPlaybackRate(boxSolo ? 1 : bossEnd ? 0.45 + Math.sin(t * 3) * 0.08 : 0.82 + 0.18 * Math.min(1, st.wind * 3));
  }
  if (loops.ambience) loops.ambience.setVolume(0.24 * (EL ? EL.duck : 1));
  if (loops.room) loops.room.setVolume((0.12 + st.vent * 0.07) * (EL ? EL.duck : 1));
  if (loops.gen) {
    const on = w && w.generator && w.generator.running;
    loops.gen.setVolume(on ? 2.2 : 0);
    if (on) shake.amp = Math.max(shake.amp, 0.06);
  }
  audio.setBusVolume('music', save.data.settings.musicVol ?? 0.8);
  audio.setBusVolume('sfx', save.data.settings.sfxVol ?? 1);
  audio.listener.setMasterVolume(save.data.settings.masterVol ?? 0.9);
  crt.uniforms.calm.value = calm() ? 1 : 0;
  actors.calm = calm();
  renderer.toneMappingExposure = 1.15 * (save.data.settings.brightness ?? 1) * (1 + (EL && !blackout ? EL.dawn * 0.3 : 0));
}

function setCursor() {
  let c = 'default';
  if (view.focused || view.focus > 0.5) c = 'none';
  else if (hoverMonitor || hoverBox || hoverSwitch) c = 'pointer';
  // the system pointer stays hidden: the drawn cursor replaces it
  const sys = started && !debugPanel.open ? 'none' : c;
  if (canvas.style.cursor !== sys) canvas.style.cursor = sys;
  // the drawn cursor stands in for the system one while captured
  if (debugPanel.open || !wantCapture()) releaseCapture();
  const show = started && !debugPanel.open && c !== 'none';
  if ((cursorEl.style.display === 'block') !== show) cursorEl.style.display = show ? 'block' : 'none';
  cursorEl.classList.toggle('pointer', c === 'pointer');
}

// hold ESC to quit (timed by the desktop shell)
{
  const quitEl = document.getElementById('quit');
  const bar = quitEl.querySelector('.bar');
  const inNight = () => term.mode !== 'menu';
  native.onEscHold((p) => {
    if (p > 0.1) quitEl.firstChild.textContent = inNight() ? '继续按住 ESC 返回主菜单' : '继续按住 ESC 退出游戏';
    quitEl.classList.toggle('show', p > 0.1);
    bar.style.width = `${Math.round(p * 100)}%`;
  });
  // long ESC: leave the night (not recorded) / quit from the menu
  native.onEscLong(() => {
    quitEl.classList.remove('show');
    if (!started) return;
    if (inNight()) {
      buzzer.error();
      showMenu();
    } else native.quit();
  });
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
let time = 0;
let termAcc = 0;

// dev capture mode (trailer footage): frames are stepped by hand with a fixed dt
let manualFrames = false;
let fovScale = 1;            // dev capture: close-ups

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const real = timer.getDelta();
  if (manualFrames) return;
  tickFrame(Math.min(real, 0.05));
}

function tickFrame(dt) {
  time += dt;

  updateCamera(dt, time);
  camera.updateMatrixWorld();

  hoverMonitor = false;
  hoverBox = false;
  hoverSwitch = null;
  let cell = null;
  const gw = game.world;
  if (started && view.hasMouse && !(ending && !ending.done)) {
    if (view.focused) cell = screenCell();
    else if (view.focus < 0.05) {
      ray.setFromCamera(view.mouse, camera);
      hoverMonitor = ray.intersectObject(room.monitor, true).length > 0;
      // only Night 6 needs the box on the shelf (STARLIGHT has the remote winder)
      hoverBox = !hoverMonitor && !!gw && !gw.result && gw.musicBox.hand && ray.intersectObject(room.musicBox.group, true).length > 0;
      for (const k of ['L', 'R']) if (ray.intersectObject(room.doorSwitches[k].group, true).length) hoverSwitch = k;
    }
  }
  // winding: hold the mouse on the box
  if (winding && (!hoverBox || !gw)) winding = false;
  if (winding) {
    const r = game.cmd('wind', { dt: game.paused ? 0 : dt * game.timeScale, hand: true });
    windTick += dt;
    if (r.ok !== false && windTick > 0.14) {
      windTick = 0;
      audio.shot('relay', room.musicBox.group.getWorldPosition(new THREE.Vector3()), { scene, volume: 0.25, ref: 0.6, rate: 2.2 });
    }
  }
  term.setMouse(view.focused ? cell : null);
  setCursor();

  game.update(dt);
  updateEnding(dt);
  term.update(dt);
  termAcc += dt;
  if (termAcc >= 1 / 50) {
    termAcc = 0;
    term.draw();
    termTex.needsUpdate = true;
  }
  crt.uniforms.time.value = time;
  crt.uniforms.glitch.value = term.glitch > 0 ? 1 : 0;
  director.update(started ? dt : 0);
  updateWorld(dt, time);
  debugPanel.update(dt);
  grade.uniforms.time.value = time;
  composer.render();
}

// ------------------------------------------------------------------ boot
async function boot() {
  const font = new FontFace('Unifont', 'url(fonts/unifont.otf)');
  await font.load();
  document.fonts.add(font);
  term.screen.fontReady();
  loadEl.textContent = '载入音频...';
  await audio.load((p) => (loadEl.textContent = `载入音频 ${Math.round(p * 100)}%`));
  loadEl.textContent = '已阅读上述警告 · 点击继续';
  startEl.classList.add('ready');
  computeFocusPose();
  frame();
}

startEl.addEventListener('click', (e) => {
  if (!startEl.classList.contains('ready') || started) return;
  started = true;
  audio.resume();
  startAudio();
  startEl.classList.add('gone');
  showMenu();
  capture(e);
});

boot();

if (import.meta.env.DEV) {
  // test hooks (dev shell only): cellPx(x, y) finds the window pixel of a terminal cell
  const cellPx = (cx, cy) => {
    let best = null;
    for (let i = 0; i <= 160; i++) {
      for (let j = 0; j <= 90; j++) {
        const ndc = new THREE.Vector2(-1 + (2 * i) / 160, -1 + (2 * j) / 90);
        const c = screenCell(ndc);
        if (!c) continue;
        const d = Math.abs(c.x + 0.5 - (cx + 0.5)) + Math.abs(c.y - cy) * 2;
        if (!best || d < best.d) best = { d, ndc };
      }
    }
    return best && { x: ((best.ndc.x + 1) / 2) * window.innerWidth, y: ((1 - best.ndc.y) / 2) * window.innerHeight };
  };
  window.__game = { game, term, view, enterFocus, exitFocus, director, room, camera, save, startNight, showMenu, grade, bloom, actors, renderer, scene, cellPx, captured: () => captured, ending: () => ending,
    // capture: freeze the loop, then render exact frames on request
    capture(on) {
      manualFrames = !!on;
    },
    zoom(k = 1) {
      fovScale = k;
    },
    step(n = 1, dt = 1 / 30) {
      for (let i = 0; i < n; i++) tickFrame(dt);
    },
  };
}
