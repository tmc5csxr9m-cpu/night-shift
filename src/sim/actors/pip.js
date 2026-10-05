// Pip Rabbit — right door. Ignores light. Follows sound lures, is blocked
// by sealed rooms (and gets impatient), and likes a noisy office.
import { Actor } from './base.js';
import { dist, stepToward, sensorRoom } from '../graph.js';

const ROUTE = ['01', '02', '06', '11', '08F', '08N', 'DOOR_R'];
const LURE_STEP = 1.5;

export class Pip extends Actor {
  constructor(w) {
    super(w, 'pip', '01');
    this.timer = this.p.interval;
    this.lure = null;        // { node, t }
    this.lureStep = 0;
    this.impatience = 0;
    this.impT = 0;
    this.lastLure = null;
    this.lureUses = {};
    this.lureHour = -1;
  }

  modifiers(mods) {
    this.stageMods(mods);
    const nb = this.w.noiseBonus();
    if (nb) mods.noise = nb;
    if (this.impT > 0) mods.impatience = Math.floor(this.impatience / this.p.impatienceDiv);
  }

  blocked(node) {
    const r = this.w.rooms[sensorRoom(node)];
    return !!(r && r.sealed);
  }

  nextNode() {
    const i = ROUTE.indexOf(this.node);
    if (i >= 0 && i < ROUTE.length - 1) return ROUTE[i + 1];
    return stepToward(this.node, 'DOOR_R', () => false);
  }

  onLure(room) {
    const w = this.w;
    const target = room === '07' ? '07F' : room === '08' ? '08F' : room;
    const atDoor = this.state === 'door';
    const d = dist(this.node, target);
    const range = atDoor ? w.P.lure.range + 1 : w.P.lure.range;
    if (d > range || d === 0) return false;
    if (this.lastLure === room) {
      w.log(`节点 ${room}: 目标对重复声源无反应`, 'dim');
      return false;
    }
    if (this.lureHour !== w.hour) {
      this.lureHour = w.hour;
      this.lureUses = {};
    }
    const eff = Math.max(0, 1 - (this.lureUses[room] || 0) * w.P.lure.decayPerUse);
    this.lureUses[room] = (this.lureUses[room] || 0) + 1;
    this.lastLure = room;
    if (!w.rng.chance(eff)) return false;
    if (atDoor) {
      this.state = 'idle';
      w.onRepel(this, 'R');
    }
    this.lure = { node: target, t: w.P.lure.duration };
    this.lureStep = 0.3;
    return true;
  }

  tick(dt) {
    const w = this.w;
    if (this.impT > 0) {
      this.impT -= dt;
      if (this.impT <= 0) this.impatience = 0;
    }
    if (this.state === 'door') {
      this.attackT -= dt;
      if (this.attackT <= 0) w.kill(this);
      return;
    }
    if (this.lure) {
      this.lure.t -= dt;
      this.lureStep -= dt;
      if (this.lureStep <= 0 && this.node !== this.lure.node) {
        this.lureStep = LURE_STEP;
        const n = stepToward(this.node, this.lure.node, (m) => this.blocked(m));
        if (n && n !== this.node && !n.startsWith('DOOR')) this.moveTo(n);
      }
      if (this.lure.t <= 0) {
        this.lure = null;
        this.timer = this.p.interval;
      }
      return;
    }
    this.timer -= dt;
    // waiting at a sealed passage builds impatience
    const next = this.nextNode();
    if (next && this.blocked(next)) {
      this.impatience += dt;
      this.waiting = true;
      if (this.timer <= 0) this.timer += this.p.interval;
      return;
    }
    if (this.waiting) {
      this.waiting = false;
      if (this.impatience > 0) this.impT = 20;
    }
    if (this.timer > 0) return;
    this.timer += this.p.interval;
    const a = this.aEff();
    const roll = w.rng.d20();
    w.trace(this, roll, a);
    if (roll > a || !next) return;
    this.moveTo(next);
    if (next === 'DOOR_R') {
      this.state = 'door';
      this.attackT = this.p.attackDelay;
      w.onDoor(this, 'R');
    }
  }

  info() {
    return {
      lure: this.lure ? `${this.lure.node} ${this.lure.t.toFixed(1)}s` : '-',
      impatience: this.impatience,
      waiting: !!this.waiting,
      lastLure: this.lastLure || '-',
    };
  }
}
