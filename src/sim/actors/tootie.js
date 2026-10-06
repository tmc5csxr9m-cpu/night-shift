// Tootie — sleeps in the staff room while the music box plays. If the
// music stops it rushes the right door; resuming the music sends it back.
import { Actor } from './base.js';

const ROUTE = ['13', '11', '08F', '08N', 'DOOR_R'];

export class Tootie extends Actor {
  constructor(w) {
    super(w, 'tootie', '13');
    this.state = 'dormant';
    this.stepT = 0;
  }

  baseA() {
    return 0;
  }

  tick(dt) {
    const w = this.w;
    const music = w.musicPlaying() && w.musicBox.wind >= (this.state === 'dormant' ? 0 : w.P.musicBox.resumeAt);
    if (this.state === 'dormant') {
      if (!w.musicPlaying()) {
        this.state = 'rush';
        this.stepT = this.p.stepTime;
        w.telegraph(this, 'wake', 'R');
        w.log('员工室: 散场曲中断 — 检测到移动!', 'warn');
      }
      return;
    }
    if (music && this.state !== 'return') {
      this.state = 'return';
      this.stepT = this.p.returnStep;
      w.onRepel(this, 'R');
      return;
    }
    if (this.state === 'return') {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.p.returnStep;
        const i = ROUTE.indexOf(this.node);
        if (i <= 0) {
          this.state = 'dormant';
          return;
        }
        this.moveTo(ROUTE[i - 1]);
      }
      return;
    }
    if (this.state === 'door') {
      this.attackT -= dt * this.w.attackRate();
      if (this.attackT <= 0) w.kill(this);
      return;
    }
    // rush
    this.stepT -= dt;
    if (this.stepT > 0) return;
    this.stepT = this.p.stepTime;
    const i = ROUTE.indexOf(this.node);
    const next = ROUTE[i + 1];
    this.moveTo(next);
    if (next === 'DOOR_R') {
      this.state = 'door';
      this.attackT = this.p.attackDelay;
      w.onDoor(this, 'R');
    }
  }

  info() {
    return { wind: this.w.musicBox.wind.toFixed(2), stepT: this.stepT };
  }
}
