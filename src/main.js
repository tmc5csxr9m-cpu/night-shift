import * as THREE from 'three';
import { buildRoom } from './scene/room.js';
import { makeComposer } from './scene/post.js';
import { crtCurve } from './scene/crt.js';
import { AudioSys, Buzzer, Phone } from './audio.js';
import { Terminal } from './term/terminal.js';
import { COLS, ROWS } from './term/screen.js';
import { Director } from './director.js';
import { game } from './game.js';
import { save } from './save.js';
import { on } from './bus.js';
import { debugPanel } from './debug/panel.js';
import { CALLS } from './data/calls.js';
import { ActorViews, NODE_POS } from './scene/actors.js';
import { ROOMS, roomWorldPos } from './rooms.js';

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
const phone = new Phone(audio, room.anchors.phone);
const term = new Terminal(buzzer);
const termTex = new THREE.CanvasTexture(term.screen.canvas);
termTex.colorSpace = THREE.SRGBColorSpace;
termTex.anisotropy = 8;
termTex.minFilter = THREE.LinearMipmapLinearFilter;
room.makeScreen(termTex);
const crt = room.crtMat;
const director = new Director({ audio, scene, room, term });
const actors = new ActorViews(scene);
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
let hoverPhone = false;

function screenCell() {
  ray.setFromCamera(view.mouse, camera);
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
window.addEventListener('mousemove', (e) => {
  view.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  view.hasMouse = true;
});
document.addEventListener('mouseleave', () => (view.hasMouse = false));
canvas.addEventListener('mousedown', (e) => {
  if (!started || e.button !== 0) return;
  if (view.focused) {
    const cell = screenCell();
    if (cell) term.mouseDown(cell);
    else exitFocus();
  } else if (hoverMonitor) enterFocus();
  else if (hoverPhone && game.world) {
    const st = game.world.phone.state;
    if (st === 'ringing') game.cmd('answerPhone');
    else if (st === 'call') game.cmd('hangUp');
  }
});
window.addEventListener('mouseup', () => term.mouseUp());
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  exitFocus();
});
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
    view.yaw += (view.cinematic.yaw - view.yaw) * Math.min(1, dt * 14);
    view.pitch += (0.02 - view.pitch) * Math.min(1, dt * 14);
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
  const fov = FOV + (FOCUS_FOV - FOV) * e;
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

function showMenu() {
  view.cinematic = null;
  actors.clearJumpscare();
  scare = null;
  game.toMenu();
  lockFocus();
  phone.stop();
  subtitle.classList.remove('show');
  term.showMenu();
  ending = null;
}

let ending = null; // { kind, t }
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

function startNight(n, debug) {
  phone.stop();
  subtitle.classList.remove('show');
  game.start(n, { debug });
  lastLook = 'F';
  ending = null;
  view.locked = false;
  view.focused = false;
  term.focused = false;
  view.yaw = 0;
  view.cinematic = null;
  actors.clearJumpscare();
  scare = null;
  term.startNight();
  intro.querySelector('.t').textContent = n === 0 ? 'TEST' : '12:00 AM';
  intro.querySelector('.n').textContent = game.nightName(n);
  intro.classList.add('show');
  setTimeout(() => intro.classList.remove('show'), 3200);
  if (n === 1 && !game.debug) {
    setTimeout(() => hint.classList.remove('hidden'), 3600);
    setTimeout(() => hint.classList.add('hidden'), 14000);
  }
}

term.actions = {
  start: (n, debug) => startNight(n, debug),
  menu: () => showMenu(),
};

// replays exported from the debug panel (or the balance tools)
debugPanel.onReplay = (data) => {
  startNight(data.night, true);
  game.replay = data.commands.slice();
};

// ------------------------------------------------------------------ sim events -> presentation
on('sim:phone', (e) => {
  if (e.state === 'ringing') {
    phone.ring(2);
    ringTimer = 3;
  } else if (e.state === 'call') {
    const lines = CALLS[e.night] || [];
    const voice = e.night === 6 ? { pitch: 96, rate: 0.13, warble: 0.6 } : { pitch: 128, rate: 0.1 };
    phone.speak(lines, (i, text) => {
      subtitle.textContent = text;
      subtitle.classList.add('show');
    }, () => subtitle.classList.remove('show'), voice);
    if (!save.data.seen.calls.includes(e.night)) {
      save.data.seen.calls.push(e.night);
      save.write();
    }
  } else {
    phone.stop();
    subtitle.classList.remove('show');
  }
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
on('sim:overtime', () => {
  buzzer.error();
  shake.amp = 0.2;
});
// --- animatronic sounds, positioned where the sim says they are
const CUE_SOUND = {
  sunny: { step: ['step_heavy', 1], greet: ['greet_sunny', 1] },
  pip: { step: ['step_light', 1], greet: ['greet_pip', 1] },
  tootie: { step: ['step_light', 1.35], greet: ['horn', 1] },
};
on('sim:cue', (e) => {
  actors.event(e);
  const def = CUE_SOUND[e.source]?.[e.kind];
  const pos = NODE_POS[e.node];
  if (!def || !pos) return;
  const v = new THREE.Vector3(...pos);
  const far = v.length() > 6;
  const vol = Math.min(2.5, Math.pow(10, (e.db - 44) / 20));
  audio.shot(def[0], v, { scene, volume: vol, ref: 2, lowpass: far ? 1400 : 0, rate: def[1] * (0.95 + Math.random() * 0.1) });
});
on('sim:repel', (e) => {
  actors.event(e);
  const side = e.side === 'L' ? NODE_POS.DOOR_L : NODE_POS.DOOR_R;
  audio.shot('servo', new THREE.Vector3(...side), { scene, volume: 0.8, ref: 1.5, rate: 0.8 });
  if (e.actor === 'sunny') setTimeout(() => audio.shot('step_heavy', new THREE.Vector3(-6, 1, 0), { scene, volume: 0.8, ref: 2 }), 900);
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

on('sim:powerOut', () => {
  audio.shot('thud', room.anchors.lamp.position, { scene, volume: 1.2, ref: 2, rate: 0.7 });
});

on('nightEnd', ({ result }) => {
  phone.stop();
  subtitle.classList.remove('show');
  ending = { kind: result.outcome, t: 0 };
  if (result.outcome === 'death') {
    const who = actors.views[result.cause] ? result.cause : 'sunny';
    const side = who === 'sunny' ? 'L' : 'R';
    // snap the view to the door it came from, then it lunges
    view.locked = false;
    view.focused = false;
    term.focused = false;
    view.cinematic = { yaw: side === 'L' ? 1.5 : -1.5 };
    ending.scareAt = 0.35;
    ending.who = who;
  } else if (result.outcome === 'win') {
    for (let i = 0; i < 6; i++) setTimeout(() => audio.shot('bell6', room.anchors.monitor.position, { scene, volume: 1.0, ref: 2 }), 300 + i * 950);
  } else {
    buzzer.error();
  }
});

function updateEnding(dt) {
  if (!ending || ending.done) return;
  ending.t += dt;
  const k = ending.kind;
  if (k === 'death') {
    if (ending.scareAt !== undefined && ending.t >= ending.scareAt && !scare) {
      scare = actors.jumpscare(ending.who, camera);
      audio.shot('scream', camera.position, { scene, volume: 1.6, ref: 1 });
      shake.amp = 2.5;
      tinnitus();
    }
    actors.updateJumpscare(dt, scare);
    grade.uniforms.dark.value = ending.t > 1.4 ? Math.min(1, (ending.t - 1.4) * 4) : 0;
  }
  if (ending.t > (k === 'death' ? 2.6 : k === 'win' ? 5.5 : 1.5) && term.mode !== 'result') {
    grade.uniforms.dark.value = 0;
    ending.done = true;
    view.cinematic = null;
    actors.clearJumpscare();
    scare = null;
    lockFocus();
    term.showResult();
  }
}

// ------------------------------------------------------------------ world -> 3D / audio
const loops = {};
const doorStrike = { L: 0, R: 0 };
const sparks = { L: 0, R: 0 };
let degauss = 0;
const MENU = { light: 2, fan: true, osc: true, vent: 1, music: true, wind: 1, doors: { L: false, R: false }, heat: { L: 0, R: 0 } };

function startAudio() {
  loops.ambience = audio.loop('ambience', { volume: 0.32 });
  loops.room = audio.loop('roomtone', { volume: 0.22 });
  loops.fan = audio.loop('fan', { parent: room.anchors.fan, volume: 0.5, ref: 0.6, rolloff: 1.1 });
  loops.lamp = audio.loop('buzz', { parent: room.anchors.lamp, volume: 0.05, ref: 0.8 });
  loops.doorL = audio.loop('buzz', { parent: room.doorLights.L.anchor, volume: 0, ref: 1, rate: 0.98 });
  loops.doorR = audio.loop('buzz', { parent: room.doorLights.R.anchor, volume: 0, ref: 1, rate: 1.02 });
  loops.tension = audio.loop('tension', { volume: 0 });
  loops.heart = audio.loop('heartbeat', { volume: 0 });
  loops.emi = audio.loop('buzz', { parent: room.anchors.monitor, volume: 0, ref: 0.5, rate: 1.5 });
  const mbAnchor = new THREE.Object3D();
  mbAnchor.position.set(11, 1.4, 5);
  scene.add(mbAnchor);
  loops.music = audio.loop('musicbox', { parent: mbAnchor, volume: 0, ref: 3.5, rolloff: 0.9, lowpass: 2400, offset: 0 });
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
  f.speed += ((st.fan ? 26 : 0) - f.speed) * dt * (st.fan ? 0.9 : 0.35);
  f.blades.rotation.z -= f.speed * dt;
  if (st.osc && f.speed > 1) f.osc = (f.osc || 0) + dt * 0.45 * (f.speed / 26);
  f.head.rotation.y = Math.sin(f.osc || 0) * 0.65;
  if (loops.fan) {
    loops.fan.setVolume(0.55 * Math.min(1, f.speed / 26));
    loops.fan.setPlaybackRate(0.55 + 0.45 * Math.min(1, f.speed / 26));
  }

  // office lamp
  const lv = [0, 0.35, 1][st.light];
  const fl = director.lampFlicker(t);
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
    if (st.doors[k]) {
      if (doorStrike[k] > 0) {
        doorStrike[k] -= dt;
        lvl = Math.random() < 0.5 ? 0 : 0.7;
      } else {
        const hot = st.heat[k] > 75;
        lvl = Math.random() < (hot ? 0.12 : 0.006) ? 0.3 : 1;
      }
    }
    const warm = Math.min(1, Math.max(0, (st.heat[k] - 50) / 50));
    D.spot.color.setRGB(0.85 + warm * 0.15, 0.89 - warm * 0.15, 1.0 - warm * 0.45);
    D.spot.intensity = 32 * lvl;
    D.spill.intensity = 2.2 * lvl;
    D.bulbMat.emissiveIntensity = 4 * lvl;
    if (sparks[k] > 0) {
      sparks[k] -= dt;
      D.spill.intensity = Math.random() < 0.5 ? 3 : 0;
      D.spill.color.setHex(0xffc070);
    } else D.spill.color.setHex(0xd8e4ff);
    room.panelLeds[k].emissive.setHex(st.doors[k] ? 0x30ff60 : 0xff3020);
    room.panelLeds[k].emissiveIntensity = st.doors[k] ? 2.2 : 0.6;
    const lp = k === 'L' ? loops.doorL : loops.doorR;
    if (lp) lp.setVolume(st.doors[k] ? 0.3 * Math.max(0.3, lvl) : 0);
  }

  // animatronics in the corridors; dust in the beams
  const lightLevel = { L: room.doorLights.L.spot.intensity / 32, R: room.doorLights.R.spot.intensity / 32 };
  for (const k of ['L', 'R']) {
    const du = room.doorLights[k].dust.material.uniforms;
    du.level.value = lightLevel[k];
    du.time.value = t;
  }
  actors.ghosts = game.debug && debugPanel.ghosts;
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
  grade.uniforms.vignette.value = 1.15 + view.tension * 0.6;

  // CRT: power, EMI, magnetisation, degauss, heat
  const termOn = started && (!w || !w.power.out) && term.mode !== 'dead';
  const pu = crt.uniforms.power;
  pu.value = termOn ? Math.min(1, pu.value + dt * 0.8) : Math.max(0, pu.value - dt * 1.6);
  if (w && !w.result) {
    crt.uniforms.emi.value.set(w.emi.L, w.emi.R, w.emi.B, w.emi.T);
    crt.uniforms.magnet.value = w.emi.magnet * 0.8;
    crt.uniforms.heat.value = Math.max(0, w.temp.eff - 30) / 6;
    if (loops.emi) loops.emi.setVolume(Math.min(0.5, (w.emi.L + w.emi.R + w.emi.B + w.emi.T) * 0.25));
  } else {
    crt.uniforms.emi.value.set(0, 0, 0, 0);
    crt.uniforms.magnet.value = 0;
    crt.uniforms.heat.value = 0;
  }
  degauss = Math.max(0, degauss - dt * 1.1);
  crt.uniforms.degauss.value = degauss;
  crt.uniforms.bright.value = 0.88 * (save.data.settings.crtIntensity ?? 1) + 0.2 * (1 - (save.data.settings.crtIntensity ?? 1));
  room.screenLight.intensity = 9 * pu.value * (0.95 + Math.random() * 0.05) * (term.glitch > 0 ? 0.6 + Math.random() * 0.6 : 1);
  room.monitorLed.emissiveIntensity = termOn ? 2 : 0;

  // phone: ringing bursts + LED
  if (w && w.phone.state === 'ringing') {
    ringTimer -= dt;
    if (ringTimer <= 0) {
      phone.ring(1.6);
      ringTimer = 3;
    }
    room.phoneLed.emissiveIntensity = Math.floor(t * 6) % 2 ? 3 : 0;
  } else room.phoneLed.emissiveIntensity = Math.floor(t * 0.8) % 2 ? 1.2 : 0;

  room.clockSecond.rotation.z = -(Math.floor(t) % 2 ? 0.105 : 0);

  // music box
  if (loops.music) {
    const vol = st.music ? 0.55 : 0;
    const cur = loops.music.getVolume();
    loops.music.setVolume(cur + (vol - cur) * Math.min(1, dt * 3));
    loops.music.setPlaybackRate(0.82 + 0.18 * Math.min(1, st.wind * 3));
  }
  if (loops.room) loops.room.setVolume(0.12 + st.vent * 0.07);
  if (loops.ambience) loops.ambience.setVolume(0.32 * (save.data.settings.musicVol ?? 0.8));
  audio.listener.setMasterVolume(save.data.settings.masterVol ?? 0.9);
  renderer.toneMappingExposure = 1.15 * (save.data.settings.brightness ?? 1);
}

function setCursor() {
  let c = 'default';
  if (view.focused || view.focus > 0.5) c = 'none';
  else if (hoverMonitor || hoverPhone) c = 'pointer';
  if (canvas.style.cursor !== c) canvas.style.cursor = c;
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
let time = 0;
let termAcc = 0;

function applyReplay() {
  const w = game.world;
  if (!game.replay || !w) return;
  while (game.replay.length && game.replay[0].tick <= w.tickN) {
    const c = game.replay.shift();
    w.cmd(c.name, c.args);
  }
}

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  time += dt;

  updateCamera(dt, time);
  camera.updateMatrixWorld();

  hoverMonitor = false;
  hoverPhone = false;
  let cell = null;
  if (started && view.hasMouse) {
    if (view.focused) cell = screenCell();
    else if (view.focus < 0.05) {
      ray.setFromCamera(view.mouse, camera);
      hoverMonitor = ray.intersectObject(room.monitor, true).length > 0;
      hoverPhone = !hoverMonitor && ray.intersectObject(room.phone, true).length > 0;
    }
  }
  term.setMouse(view.focused ? cell : null);
  setCursor();

  applyReplay();
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
  loadEl.textContent = '点击进入';
  startEl.classList.add('ready');
  computeFocusPose();
  frame();
}

startEl.addEventListener('click', () => {
  if (!startEl.classList.contains('ready') || started) return;
  started = true;
  audio.resume();
  startAudio();
  startEl.classList.add('gone');
  showMenu();
  if (new URLSearchParams(location.search).has('debug')) save.setting('debug', true);
});

boot();

if (import.meta.env.DEV) window.__game = { game, term, view, enterFocus, exitFocus, director, room, camera, save, startNight, showMenu };
