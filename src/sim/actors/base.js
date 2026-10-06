import { sensorRoom } from '../graph.js';

export class Actor {
  constructor(world, id, start) {
    this.w = world;
    this.id = id;
    this.node = start;
    this.start = start;
    this.state = 'idle';
    this.timer = 0;
    this.attackT = 0;
    this.mods = {};
    this.disabled = false;
  }

  get p() {
    return this.w.P.actors[this.id];
  }

  // base aggression from the night table (0 while the tutorial call plays
  // for threats that are new tonight)
  baseA() {
    const w = this.w;
    const table = w.night.A[this.id];
    if (!table) return 0;
    if (w.isNewTonight(this.id) && w.t < w.callGate) return 0;
    if (w.overtime) return table[5] + 2;
    return table[Math.min(5, w.hour)];
  }

  // effective aggression; fills this.mods for the debug panel
  aEff() {
    const mods = (this.mods = {});
    let a = this.baseA();
    this.modifiers(mods);
    if (a > 0 && this.w.officeDark() && this.w.P.darkBonus[this.id]) mods.dark = this.w.P.darkBonus[this.id];
    for (const k in mods) a += mods[k];
    return Math.max(0, a);
  }

  modifiers() {}

  stageMods(mods) {
    if (this.node !== '01') return;
    mods.stage = this.w.powered('C9') ? this.p.stageOn : this.p.stageOff;
  }

  room() {
    return sensorRoom(this.node);
  }

  moveTo(node) {
    const from = this.node;
    this.node = node;
    this.w.onMove(this, from, node);
  }

  info() {
    return {};
  }
}
