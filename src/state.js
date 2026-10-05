// Shared game state. The 3D scene, audio and terminal all read from here;
// anything that changes it calls emit() so listeners can react.

const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

export function emit(evt, data) {
  const set = listeners.get(evt);
  if (set) for (const fn of set) fn(data);
}

// Night runs 00:00 -> 06:00 (360 in-game minutes) over 9 real minutes,
// i.e. 1 in-game minute = 1.5 real seconds. Frozen in this demo.
export const NIGHT_REAL_SECONDS = 9 * 60;
export const NIGHT_GAME_MINUTES = 6 * 60;
export const REAL_SEC_PER_GAME_MIN = NIGHT_REAL_SECONDS / NIGHT_GAME_MINUTES;

export const state = {
  night: 1,
  date: '1993-11-12',
  timeFrozen: true,      // demo: time does not flow
  gameMinutes: 0,        // 0..360
  power: Infinity,       // demo: infinite power
  powerMax: 100,

  // facilities ----------------------------------------------------------
  doorLight: { L: false, R: false },
  officeLight: 2,        // 0 off, 1 dim, 2 normal
  fan: { on: true, oscillate: true },
  vent: 2,               // 0..3
  heater: false,
  temp: 24.6,            // office temperature, deg C
  backLock: true,        // back door maglock
  musicBox: { wind: 0.72, playing: true },
  pa: false,

  // power circuits (breakers). load in kW at full use
  circuits: [
    { id: 'C1', name: '办公室照明', en: 'OFFICE LT', load: 0.42, on: true },
    { id: 'C2', name: '左门灯', en: 'L-DOOR LT', load: 0.65, on: true },
    { id: 'C3', name: '右门灯', en: 'R-DOOR LT', load: 0.65, on: true },
    { id: 'C4', name: '通风系统', en: 'HVAC', load: 1.10, on: true },
    { id: 'C5', name: '桌面风扇', en: 'DESK FAN', load: 0.08, on: true },
    { id: 'C6', name: '传感网络', en: 'SENSOR NET', load: 0.55, on: true },
    { id: 'C7', name: '公共广播', en: 'PA SYSTEM', load: 0.30, on: true },
    { id: 'C8', name: '后门磁锁', en: 'MAGLOCK', load: 0.35, on: true },
    { id: 'C9', name: '舞台电路', en: 'STAGE', load: 2.40, on: true },
    { id: 'C0', name: '后厨冷库', en: 'FREEZER', load: 1.30, on: true },
  ],

  // map rooms state, keyed by id. filled by map page
  rooms: {},

  tasks: [],

  log: [],
};

export function circuit(id) {
  return state.circuits.find((c) => c.id === id);
}

// whether a facility actually has power (its breaker is closed)
export function powered(id) {
  const c = circuit(id);
  return !c || c.on;
}

export function clockString(min = state.gameMinutes) {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function log(msg, level = 'info') {
  state.log.push({ t: clockString(), msg, level });
  if (state.log.length > 60) state.log.shift();
  emit('log', msg);
}

// current power draw in kW, derived from what is switched on
export function currentLoad() {
  let kw = 0.6; // terminal + base systems
  const c = (id) => powered(id);
  if (c('C1')) kw += [0, 0.18, 0.42][state.officeLight];
  if (c('C2') && state.doorLight.L) kw += 0.65;
  if (c('C3') && state.doorLight.R) kw += 0.65;
  if (c('C4')) kw += state.vent * 0.36;
  if (c('C5') && state.fan.on) kw += 0.08;
  if (c('C6')) kw += 0.55;
  if (c('C7') && (state.pa || state.musicBox.playing)) kw += 0.3;
  if (c('C8') && state.backLock) kw += 0.35;
  if (c('C9')) kw += 2.4;
  if (c('C0')) kw += 1.3;
  if (state.heater) kw += 1.5;
  return kw;
}
