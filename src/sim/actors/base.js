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

  // base aggression from the night table (0 during the opening grace period
  // for threats that are new tonight). Night 6 held at 05:59 keeps the 05:00
  // value: nothing escalates while the clock is stuck.
  baseA() {
    const w = this.w;
    const table = w.night.A[this.id];
    if (!table) return 0;
    if (w.isNewTonight(this.id) && w.t < w.callGate) return 0;
    return table[Math.min(5, w.hour)];
  }

  // effective aggression; fills this.mods for the debug panel
  // tonight's new threat during the opening grace period: nothing moves it
  inGrace() {
    return this.w.isNewTonight(this.id) && this.w.t < this.w.callGate;
  }

  aEff() {
    const mods = (this.mods = {});
    if (this.inGrace()) return 0;
    let a = this.baseA();
    this.modifiers(mods);
    if (a > 0 && this.w.officeDark() && this.w.P.darkBonus[this.id]) mods.dark = this.w.P.darkBonus[this.id];
    for (const k in mods) a += mods[k];
    return Math.max(0, a);
  }

  modifiers() {}

  stageMods(mods) {
    if (this.shockT > 0) mods.shock = this.w.P.stageShock.bonus;
    if (this.node !== '01') return;
    mods.stage = this.w.powered('C9') ? this.p.stageOn : this.p.stageOff;
  }

  room() {
    return sensorRoom(this.node);
  }

  // boss-driven attack: after `delay` seconds, appear at this actor's door
  forceDoor(delay) {
    this.forcedT = delay;
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
