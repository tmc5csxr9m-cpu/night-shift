// Game controller: owns the current World, steps it at a fixed rate, and
// forwards sim events to the client bus.
import { World, NIGHTS } from './sim/index.js';
import { emit } from './bus.js';
import { save } from './save.js';

export const game = {
  world: null,
  night: 0,
  mode: 'menu',          // menu | night | result
  debug: false,          // debug run (does not write progress)
  timeScale: 1,
  paused: false,
  acc: 0,
  stepOnce: false,
  realTime: 0,

  start(night, { seed, debug = false, replay = null } = {}) {
    this.night = night;
    // a replay only ever drives the night it was loaded for
    this.replay = replay ? replay.slice() : null;
    this.debug = debug;
    this.world = new World({ night, seed: seed ?? (Date.now() & 0x7fffffff) });
    this.mode = 'night';
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.realTime = 0;
    emit('nightStart', { night, world: this.world });
    return this.world;
  },

  toMenu() {
    this.finalize();
    this.world = null;
    this.replay = null;
    this.mode = 'menu';
    emit('menu');
  },

  cmd(name, args) {
    if (!this.world) return { ok: false };
    const r = this.world.cmd(name, args);
    this.flush();
    // a command can end the night (the last Night 6 task): record it now
    this.finalize();
    return r;
  },

  update(dt) {
    const w = this.world;
    if (!w || this.mode !== 'night') return;
    this.realTime += dt;
    if (!this.paused) this.acc += dt * this.timeScale;
    else if (this.stepOnce) {
      this.acc += w.P.tick;
      this.stepOnce = false;
    }
    let guard = 2000;
    while (this.acc >= w.P.tick && !w.result && guard--) {
      this.acc -= w.P.tick;
      // replayed commands go in at exactly the tick they were recorded at
      while (this.replay && this.replay.length && this.replay[0].tick <= w.tickN) {
        const c = this.replay.shift();
        w.cmd(c.name, c.args);
      }
      w.tick();
    }
    this.flush();
    this.finalize();
  },

  // record the finished night once and announce it (from a tick or a command)
  finalize() {
    const w = this.world;
    if (!w || !w.result || this.mode !== 'night') return;
    this.mode = 'result';
    this.replay = null;
    if (!this.debug) save.recordNight(this.night, w.result, w);
    emit('nightEnd', { result: w.result, world: w });
  },

  flush() {
    const w = this.world;
    if (!w || !w.events.length) return;
    const evs = w.events;
    w.events = [];
    for (const e of evs) emit('sim:' + e.type, e);
  },

  nightName(n) {
    return NIGHTS[n]?.name || `第 ${n} 夜`;
  },
};
