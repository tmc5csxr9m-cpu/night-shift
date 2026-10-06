// The thing behind the back door. Never seen. It drags itself from the
// power room along the old service passage to the emergency exit behind
// your chair. Only the maglock stops it — and the cheap coil overheats.
// Shutters do nothing (the service passage has none); the generator in its
// room agitates it.
import { Actor } from './base.js';

const ROUTE = ['10', 'BACKP', '12', 'DOOR_B'];

export class Back extends Actor {
  constructor(w) {
    super(w, 'back', '10');
    this.timer = this.p.interval;
    this.lockT = 0;
  }

  modifiers(mods) {
    if (this.w.generatorRunning?.()) mods.generator = this.p.generator;
  }

  tick(dt) {
    const w = this.w;
    if (this.state === 'door') {
      if (w.office.maglock && w.powered('C8')) {
        // pushes against the locked door, then gives up
        this.lockT += dt;
        if (this.lockT >= w.P.maglock.giveUp) {
          this.state = 'idle';
          this.lockT = 0;
          this.timer = this.p.interval * 1.5;
          this.moveTo('10');
          w.onRepel(this, 'B');
        }
        return;
      }
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
    if (next === 'DOOR_B') {
      this.state = 'door';
      this.attackT = this.p.attackDelay;
      this.lockT = 0;
      w.onDoor(this, 'B');
    }
  }

  info() {
    return { lockT: this.lockT };
  }
}
