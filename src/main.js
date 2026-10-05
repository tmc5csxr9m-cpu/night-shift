import * as THREE from 'three';
import { buildRoom } from './scene/room.js';
import { makeComposer } from './scene/post.js';
import { crtCurve } from './scene/crt.js';
import { AudioSys, Buzzer } from './audio.js';
import { Terminal } from './term/terminal.js';
import { COLS, ROWS } from './term/screen.js';
import { Director } from './director.js';
import { state, powered, log, on } from './state.js';

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

// ------------------------------------------------------------------ audio + terminal
const audio = new AudioSys(camera);
const buzzer = new Buzzer(audio, room.anchors.monitor);
const term = new Terminal(buzzer);
const termTex = new THREE.CanvasTexture(term.screen.canvas);
termTex.colorSpace = THREE.SRGBColorSpace;
termTex.anisotropy = 8;
termTex.generateMipmaps = true;
termTex.minFilter = THREE.LinearMipmapLinearFilter;
room.makeScreen(termTex);
const crt = room.crtMat;

const director = new Director({ audio, scene, room, term });

// ------------------------------------------------------------------ view control
const view = {
  yaw: 0,
  pitch: -0.1,
  yawVel: 0,
  mouse: new THREE.Vector2(0, 0),
  hasMouse: false,
  focus: 0,           // 0 free look .. 1 at terminal (eased)
  focused: false,
};
const YAW_MAX = 1.78;  // ~106 deg: you can see the side doors, never the back door

const ray = new THREE.Raycaster();
let started = false;
let hoverMonitor = false;
let termCell = null;

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
}

function exitFocus() {
  if (!view.focused) return;
  view.focused = false;
  term.focused = false;
  term.setMouse(null);
  term.mouseUp();
}

const canvas = renderer.domElement;
window.addEventListener('mousemove', (e) => {
  view.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  view.hasMouse = true;
});
document.addEventListener('mouseleave', () => (view.hasMouse = false));
canvas.addEventListener('mousedown', (e) => {
  if (!started) return;
  if (e.button !== 0) return;
  if (view.focused) {
    const cell = screenCell();
    if (cell) term.mouseDown(cell);
    else exitFocus();
  } else if (hoverMonitor) enterFocus();
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

// target pose in front of the screen
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
  const m = new THREE.Matrix4().lookAt(focusPos, c, new THREE.Vector3(0, 1, 0));
  focusQuat.setFromRotationMatrix(m);
}

const freeQuat = new THREE.Quaternion();
const freeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const freePos = new THREE.Vector3();

function updateCamera(dt, t) {
  const target = view.focused ? 1 : 0;
  view.focus += (target - view.focus) * Math.min(1, dt * 5.5);
  if (Math.abs(target - view.focus) < 0.001) view.focus = target;

  if (!view.focused && view.focus < 0.5 && view.hasMouse) {
    // FNAF-style edge panning
    const mx = view.mouse.x;
    const dead = 0.32;
    let want = 0;
    if (Math.abs(mx) > dead) want = -Math.sign(mx) * Math.pow((Math.abs(mx) - dead) / (1 - dead), 1.4) * 2.4;
    view.yawVel += (want - view.yawVel) * Math.min(1, dt * 6);
    const pitchWant = -0.1 + view.mouse.y * 0.28;
    view.pitch += (pitchWant - view.pitch) * Math.min(1, dt * 3);
  } else {
    view.yawVel *= Math.max(0, 1 - dt * 8);
  }
  view.yaw += view.yawVel * dt;
  if (Math.abs(view.yaw) > YAW_MAX) {
    view.yaw = Math.sign(view.yaw) * YAW_MAX;
    view.yawVel = 0;
  }

  // breathing / idle sway
  const br = Math.sin(t * 1.15);
  freePos.copy(EYE);
  freePos.y += br * 0.006;
  freePos.x += Math.sin(t * 0.37) * 0.01;
  // leaning toward a door when looking at it
  freePos.x += Math.sin(-view.yaw) * 0.12 * Math.min(1, Math.abs(view.yaw) / 1.5);
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

// ------------------------------------------------------------------ world sim
let musicEmptyLogged = false;
function simulate(dt) {
  const fanOn = powered('C5') && state.fan.on;
  const lightLv = powered('C1') ? state.officeLight : 0;
  const vent = powered('C4') ? state.vent : 0;
  const target = 28.5 + (state.heater ? 7 : 0) - vent * 1.5 - (fanOn ? 0.9 : 0) + lightLv * 0.3;
  state.temp += (target - state.temp) * dt * 0.025;
  const mb = state.musicBox;
  if (mb.playing && powered('C7')) mb.wind = Math.max(0, mb.wind - dt * 0.0035);
  if (mb.wind <= 0 && !musicEmptyLogged) {
    musicEmptyLogged = true;
    log('音乐盒发条已耗尽.', 'warn');
  }
  if (mb.wind > 0.05) musicEmptyLogged = false;
}

// ------------------------------------------------------------------ ambient audio
const loops = {};
function startAudio() {
  loops.ambience = audio.loop('ambience', { volume: 0.32 });
  loops.room = audio.loop('roomtone', { volume: 0.22 });
  loops.fan = audio.loop('fan', { parent: room.anchors.fan, volume: 0.5, ref: 0.6, rolloff: 1.1 });
  loops.lamp = audio.loop('buzz', { parent: room.anchors.lamp, volume: 0.05, ref: 0.8 });
  loops.doorL = audio.loop('buzz', { parent: room.doorLights.L.anchor, volume: 0, ref: 1, rate: 0.98 });
  loops.doorR = audio.loop('buzz', { parent: room.doorLights.R.anchor, volume: 0, ref: 1, rate: 1.02 });
  // the music box plays somewhere far down the east corridor
  const mbAnchor = new THREE.Object3D();
  mbAnchor.position.set(11, 1.4, -4);
  scene.add(mbAnchor);
  loops.music = audio.loop('musicbox', { parent: mbAnchor, volume: 0, ref: 3.5, rolloff: 0.9, lowpass: 2400, offset: 0 });
}

// door-light state machine (fluorescent strike + flicker)
const doorLevel = { L: 0, R: 0 };
const doorStrike = { L: 0, R: 0 };
on('facility', () => {
  for (const k of ['L', 'R']) {
    const want = state.doorLight[k] && powered(k === 'L' ? 'C2' : 'C3');
    if (want && doorLevel[k] === 0 && doorStrike[k] <= 0) {
      doorStrike[k] = 0.35;
      audio.shot('relay', room.doorLights[k].anchor.position, { scene, volume: 0.9, ref: 1 });
    }
    if (!want && doorLevel[k] > 0) audio.shot('relay', room.doorLights[k].anchor.position, { scene, volume: 0.7, ref: 1, rate: 1.15 });
    if (!want) state.doorLight[k] = state.doorLight[k] && powered(k === 'L' ? 'C2' : 'C3');
  }
});

function updateWorld(dt, t) {
  // ---- fan
  const fanOn = powered('C5') && state.fan.on;
  const f = room.fan;
  f.speed += ((fanOn ? 26 : 0) - f.speed) * dt * (fanOn ? 0.9 : 0.35);
  f.blades.rotation.z -= f.speed * dt;
  if (state.fan.oscillate && f.speed > 1) {
    f.osc = (f.osc || 0) + dt * 0.45 * (f.speed / 26);
  }
  f.head.rotation.y = Math.sin(f.osc || 0) * 0.65;
  if (loops.fan) {
    loops.fan.setVolume(0.55 * Math.min(1, f.speed / 26));
    loops.fan.setPlaybackRate(0.55 + 0.45 * Math.min(1, f.speed / 26));
  }

  // ---- office lamp
  const lv = powered('C1') ? [0, 0.35, 1][state.officeLight] : 0;
  const fl = director.lampFlicker(t);
  const L = room.lamp;
  L.spot.intensity = L.base.spot * lv * fl;
  L.fill.intensity = L.base.fill * lv * fl;
  L.bulbMat.emissiveIntensity = L.base.emissive * lv * fl + 0.02;
  L.group.rotation.z = Math.sin(t * 0.55) * 0.012;
  L.group.rotation.x = Math.sin(t * 0.41) * 0.008;
  if (loops.lamp) loops.lamp.setVolume(0.06 * lv * fl);

  // ---- door lights
  for (const k of ['L', 'R']) {
    const want = state.doorLight[k] && powered(k === 'L' ? 'C2' : 'C3');
    const D = room.doorLights[k];
    let lvl;
    if (want) {
      if (doorStrike[k] > 0) {
        doorStrike[k] -= dt;
        lvl = Math.random() < 0.5 ? 0.0 : 0.7;
      } else lvl = Math.random() < 0.006 ? 0.3 : 1; // the odd stutter
    } else lvl = 0;
    doorLevel[k] = want ? Math.max(0.0001, lvl) : 0;
    D.spot.intensity = 32 * lvl;
    D.spill.intensity = 0.5 * lvl;
    D.bulbMat.emissiveIntensity = 4 * lvl;
    room.panelLeds[k].emissive.setHex(want ? 0x30ff60 : 0xff3020);
    room.panelLeds[k].emissiveIntensity = want ? 2.2 : 0.6;
    const lp = k === 'L' ? loops.doorL : loops.doorR;
    if (lp) lp.setVolume(want ? 0.3 * Math.max(0.3, lvl) : 0);
  }

  // ---- screen light follows the terminal (and its warm-up)
  room.screenLight.intensity = 9 * crt.uniforms.power.value * (0.95 + Math.random() * 0.05) * (term.glitch > 0 ? 0.6 + Math.random() * 0.6 : 1);
  room.monitorLed.emissiveIntensity = started ? 2 : 0;
  // phone voicemail light, blinking slowly
  room.phoneLed.emissiveIntensity = Math.floor(t * 0.8) % 2 ? 1.5 : 0;

  // ---- frozen clock: the second hand twitches but never moves on
  room.clockSecond.rotation.z = -(Math.floor(t) % 2 ? 0.105 : 0);

  // ---- music box
  if (loops.music) {
    const mb = state.musicBox;
    const play = mb.playing && powered('C7') && mb.wind > 0;
    const vol = play ? 0.55 : 0;
    const cur = loops.music.getVolume();
    loops.music.setVolume(cur + (vol - cur) * Math.min(1, dt * 2));
    // a tired spring slows the tune down as it unwinds
    loops.music.setPlaybackRate(0.86 + 0.14 * Math.min(1, mb.wind * 3));
  }
  if (loops.room) loops.room.setVolume(0.12 + (powered('C4') ? state.vent : 0) * 0.07);

  // ---- grade: blackout darkening when the lamp flickers off
  grade.uniforms.dark.value = 0;
}

// ------------------------------------------------------------------ DOM overlays
const startEl = document.getElementById('start');
const hint = document.getElementById('hint');
const intro = document.getElementById('intro');
const loadEl = document.getElementById('load');

function setCursor() {
  let c = 'default';
  if (view.focused || view.focus > 0.5) c = 'none';
  else if (hoverMonitor) c = 'pointer';
  if (canvas.style.cursor !== c) canvas.style.cursor = c;
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
let time = 0;
let termAcc = 0;

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  time += dt;

  updateCamera(dt, time);
  camera.updateMatrixWorld();

  // pointer
  hoverMonitor = false;
  termCell = null;
  if (started && view.hasMouse) {
    if (view.focused) {
      termCell = screenCell();
    } else if (view.focus < 0.05) {
      ray.setFromCamera(view.mouse, camera);
      hoverMonitor = ray.intersectObject(room.monitor, true).length > 0;
    }
  }
  term.setMouse(view.focused ? termCell : null);
  setCursor();

  simulate(dt);
  term.update(dt);
  termAcc += dt;
  if (termAcc >= 1 / 50) {
    termAcc = 0;
    term.draw();
    termTex.needsUpdate = true;
  }

  crt.uniforms.time.value = time;
  crt.uniforms.glitch.value = term.glitch > 0 ? 1 : 0;
  if (started) crt.uniforms.power.value = Math.min(1, crt.uniforms.power.value + dt * 0.8);

  director.update(started ? dt : 0);
  updateWorld(dt, time);
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
  loadEl.textContent = '点击开始值班';
  startEl.classList.add('ready');
  frame();
  // warm up shaders behind the overlay
  composer.render();
}

startEl.addEventListener('click', () => {
  if (!startEl.classList.contains('ready') || started) return;
  started = true;
  audio.resume();
  startAudio();
  startEl.classList.add('gone');
  intro.classList.add('show');
  setTimeout(() => intro.classList.remove('show'), 4200);
  setTimeout(() => hint.classList.remove('hidden'), 4600);
  setTimeout(() => hint.classList.add('hidden'), 16000);
  setTimeout(() => term.powerOn(), 600);
  log('值班开始. 祝你好运.');
});

boot();

// dev-only handle for debugging from the console
if (import.meta.env.DEV) window.__game = { term, state, view, enterFocus, exitFocus, director, room, camera };
