// Sunny Bear — left door. Door light (spot) sends it back; a lit room
// freezes it but builds rage that comes back as extra aggression.
import { Actor } from './base.js';

const ROUTE = ['01', '02', '07F', '07N', 'DOOR_L'];

export class Sunny extends Actor {
  constructor(w) {
    super(w, 'sunny', '01');
    this.timer = this.p.interval;
    this.rage = 0;
    this.rageT = 0;
    this.litT = 0;
  }

  modifiers(mods) {
    this.stageMods(mods);
    if (this.rageT > 0) mods.rage = Math.floor(this.rage / this.p.rageDiv);
  }

  tick(dt) {
    const w = this.w;
    if (this.state === 'door') {
      this.attackT -= dt * this.w.attackRate();
      if (w.doorLit('L')) {
        this.litT += dt;
        if (this.litT >= this.p.retreatLight) {
          this.retreat();
          return;
        }
      }
      if (this.attackT <= 0) w.kill(this);
      return;
    }
    if (this.rageT > 0) {
      this.rageT -= dt;
      if (this.rageT <= 0) this.rage = 0;
    }
    // frozen by a lit room — but only for so long: then it tears free,
    // angry, and the light no longer holds it until it is switched off
    const r = w.rooms[this.room()];
    if (r && r.light && !this.broke) {
      this.rage += this.p.rageRate * dt;
      this.frozen = true;
      if (this.rage >= this.p.freezeMax) {
        this.broke = true;
        this.frozen = false;
        this.rageT = this.p.rageTime;
        w.log(`节点 ${this.room()}: 照明下的目标挣脱了!`, 'warn');
        w.cue('sunny', this.node, (w.P.cues.sunny[this.node] || 34) + 6, 'rage');
      }
      return;
    }
    if (r && !r.light) this.broke = false;
    if (this.frozen) {
      this.frozen = false;
      if (this.rage > 0) this.rageT = this.p.rageTime;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += this.p.interval;
    const a = this.aEff();
    const roll = w.rng.d20();
    w.trace(this, roll, a);
    if (roll > a) return;
    const i = ROUTE.indexOf(this.node);
    const next = ROUTE[Math.min(ROUTE.length - 1, (i < 0 ? 0 : i) + 1)];
    if (next === this.node) return;
    this.moveTo(next);
    if (next === 'DOOR_L') {
      this.state = 'door';
      this.attackT = this.p.attackDelay[Math.min(5, w.nightIndex - 1)] ?? 8;
      this.litT = 0;
      w.onDoor(this, 'L');
    }
  }

  retreat() {
    const to = this.w.nightIndex >= 4 ? '07F' : '02';
    this.state = 'idle';
    this.timer = this.p.interval;
    this.litT = 0;
    this.moveTo(to);
    this.w.onRepel(this, 'L');
  }

  info() {
    return { rage: this.rage, rageT: this.rageT, litT: this.litT, frozen: !!this.frozen };
  }
}
