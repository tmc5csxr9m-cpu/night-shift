// Chef Gordo — frozen in the kitchen walk-in. Cutting freezer power (C0)
// thaws it; once awake it lumbers to a door. Door lights do nothing; the
// kitchen bell (a lure in room 05) calls it home, shutters stop it, and a
// powered freezer refreezes it once it is back.
import { Actor } from './base.js';
import { sensorRoom } from '../graph.js';

const ROUTES = {
  L: ['05', '06', '02', '07F', '07N', 'DOOR_L'],
  R: ['05', '06', '11', '08F', '08N', 'DOOR_R'],
};

export class Chef extends Actor {
  constructor(w) {
    super(w, 'chef', '05');
    this.state = 'frozen';
    this.thaw = 0;
    this.route = null;
    this.timer = this.p.interval;
  }

  baseA() {
    return 0;
  }

  freezerOn() {
    return this.w.powered('C0') && !this.w.compressorFault();
  }

  blocked(node) {
    const r = this.w.rooms[sensorRoom(node)];
    return !!(r && r.sealed);
  }

  onLure(room) {
    if (room !== '05' || this.state === 'frozen' || this.state === 'home') return false;
    this.state = 'home';
    this.timer = this.p.returnStep;
    this.w.onRepel(this, this.node.includes('L') || this.node.startsWith('07') ? 'L' : 'R');
    this.w.log('后厨: 出餐铃响 — 大厨正在返回.', 'info');
    return true;
  }

  tick(dt) {
    const w = this.w;
    const P = this.p;
    const inFreezer = this.node === '05';
    if (inFreezer) {
      if (this.freezerOn()) this.thaw = Math.max(0, this.thaw - P.refreeze * dt);
      else this.thaw = Math.min(100, this.thaw + P.thawRate * dt);
    }
    if (this.state === 'frozen') {
      if (this.thaw >= 100) {
        this.state = 'awake';
        this.route = ROUTES[w.rng.chance(0.5) ? 'L' : 'R'];
        this.timer = P.interval;
        w.telegraph(this, 'wake', 'F');
        w.log('后厨: 冷库门被撞开!', 'err');
        w.cue('chef', '05', 40, 'wake');
      }
      return;
    }
    if (this.state === 'home') {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = P.returnStep;
      if (inFreezer) {
        // back in its bay; it only goes dormant again once cold enough
        if (this.freezerOn() && this.thaw <= P.dormantAt) this.state = 'frozen';
        else if (!this.freezerOn() && this.thaw >= 100) {
          this.state = 'awake';
          this.route = ROUTES[w.rng.chance(0.5) ? 'L' : 'R'];
        }
        return;
      }
      const i = this.route.indexOf(this.node);
      this.moveTo(i > 0 ? this.route[i - 1] : '05');
      return;
    }
    if (this.state === 'door') {
      this.attackT -= dt * this.w.attackRate();
      if (this.attackT <= 0) w.kill(this);
      return;
    }
    // awake: slow, heavy, deliberate
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = P.interval;
    const i = this.route.indexOf(this.node);
    const next = this.route[i + 1];
    if (!next || this.blocked(next)) return;
    if (!w.rng.chance(P.moveChance)) return;
    this.moveTo(next);
    if (next.startsWith('DOOR')) {
      this.state = 'door';
      this.attackT = P.attackDelay;
      w.onDoor(this, next === 'DOOR_L' ? 'L' : 'R');
    }
  }

  info() {
    return { thaw: this.thaw, route: this.route ? this.route[this.route.length - 1] : '-', freezer: this.freezerOn() ? 'on' : 'off' };
  }
}
