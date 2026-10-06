// Ribbon — the ceiling-rail marionette that now crawls through the ducts.
// It comes out of the vent high on the front wall. A strong airflow (vent
// level 3 for a few seconds) blows it back; a brightly lit office makes it
// shy, a dark one makes it bold.
import { Actor } from './base.js';

const ROUTE = ['11', 'D1', 'D2', 'VENT'];

export class Ribbon extends Actor {
  constructor(w) {
    super(w, 'ribbon', '11');
    this.timer = this.p.interval;
    this.blowT = 0;
  }

  modifiers(mods) {
    const w = this.w;
    const vent = w.ventLevel();
    if (vent >= 2) mods.vent = this.p.ventMod;
    if (w.powered('C1') && w.office.light === 2) mods.bright = this.p.brightMod;
  }

  tick(dt) {
    const w = this.w;
    const vent = w.ventLevel();
    // full blast pushes the light puppet back down the duct
    if (vent >= 3 && this.node !== '11') {
      this.blowT += dt;
      if (this.blowT >= this.p.blowTime) {
        this.blowT = 0;
        this.state = 'idle';
        this.timer = this.p.interval;
        this.moveTo('11');
        w.onRepel(this, 'T');
        return;
      }
    } else this.blowT = Math.max(0, this.blowT - dt);
    if (this.state === 'door') {
      // in a full gale it can't get a grip: the attack waits
      if (vent >= 3) return;
      this.attackT -= dt * w.attackRate();
      if (this.attackT <= 0) w.kill(this);
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += this.p.interval;
    const a = this.aEff();
    const roll = w.rng.d20();
    w.trace(this, roll, a);
    if (roll > a) return;
    const i = ROUTE.indexOf(this.node);
    const next = ROUTE[Math.min(ROUTE.length - 1, i + 1)];
    if (next === this.node) return;
    this.moveTo(next);
    if (next === 'VENT') {
      this.state = 'door';
      const d = this.p.attackDelay;
      this.attackT = Array.isArray(d) ? d[Math.min(5, w.nightIndex - 1)] : d;
      w.onDoor(this, 'T');
    }
  }

  info() {
    return { blowT: this.blowT };
  }
}
