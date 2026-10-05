// T-03: tune the backup radio link. Match frequency and amplitude of a
// reference waveform, then hold the lock.
import { C } from '../screen.js';

const PX = 31;
const PW = 46;
const PY = 6;
const PH = 11;
const LOCK_TIME = 1.6;

export const tuneGame = {
  id: 'T-03',
  name: '频率校准',
  en: 'SIGNAL TUNING',
  desc: '调整频率与振幅, 使信号与参考波形重合并保持锁定.',

  reset() {
    this.f0 = 1 + Math.round(Math.random() * 30) * 0.05;   // 1.00 - 2.50
    this.a0 = 2 + Math.floor(Math.random() * 3);           // 2 - 4
    this.f = 2.9 - (this.f0 - 1);
    this.a = this.a0 === 4 ? 1 : 5;
    this.lock = 0;
    this.done = false;
    this.listen = false;
    this.lt = 0;
  },

  matched() {
    return Math.abs(this.f - this.f0) < 0.026 && this.a === this.a0;
  },

  update(term, dt) {
    if (this.done) return;
    if (this.matched()) {
      this.lock += dt;
      if (this.lock >= LOCK_TIME) {
        this.done = true;
        this.complete?.();
      }
    } else this.lock = 0;
    if (this.listen) {
      this.lt += dt;
      if (this.lt > 0.35) {
        this.lt = 0;
        const off = Math.abs(this.f - this.f0);
        term.sfx.tone(300 + this.f * 260, 0.12, off < 0.026 ? 0.5 : 0.3);
      }
    }
  },

  draw(term, ui, complete) {
    this.complete = complete;
    const mid = PY + Math.floor(PH / 2);
    // scope frame
    for (let y = PY; y < PY + PH; y++) {
      for (let x = PX; x < PX + PW; x++) {
        const grid = (x - PX) % 6 === 0 || y === mid;
        ui.s.set(x, y, grid ? '·' : ' ', C.dim2, C.bg2);
      }
    }
    const t = term.time;
    const off = Math.min(1, Math.abs(this.f - this.f0) * 3 + Math.abs(this.a - this.a0) * 0.25);
    for (let i = 0; i < PW; i++) {
      const ph = (i / PW) * Math.PI * 2;
      const yt = Math.round(mid - this.a0 * Math.sin(ph * this.f0 + t * 2));
      const jitter = (Math.random() - 0.5) * off * 1.6;
      const yc = Math.round(mid - this.a * Math.sin(ph * this.f + t * 2) + jitter);
      ui.s.set(PX + i, yt, '·', C.yel, C.bg2);
      if (yc >= PY && yc < PY + PH) ui.s.set(PX + i, yc, yc === yt ? '█' : '▪', yc === yt ? C.hi : C.cy, C.bg2);
    }
    ui.text(PX, PY - 1, 'REF ···', C.yel);
    ui.text(PX + 9, PY - 1, 'SIG ▪▪▪', C.cy);

    // readouts
    const y = PY + PH + 1;
    ui.text(31, y, '频率', C.dim);
    ui.text(36, y, `${this.f.toFixed(2)} kHz`, C.hi);
    ui.text(51, y, '振幅', C.dim);
    ui.text(56, y, `${this.a}`, C.hi);
    const locked = this.matched();
    ui.text(64, y, locked || this.done ? '◆ 锁定' : '◇ 失锁', locked || this.done ? C.ok : C.red);
    ui.bar(64, y + 1, 12, this.done ? 1 : this.lock / LOCK_TIME, { fg: C.ok });

    if (this.done) return;
    const step = (d) => () => {
      this.f = Math.max(0.5, Math.min(3.5, Math.round((this.f + d) * 100) / 100));
      term.sfx.blip(500 + this.f * 300);
    };
    const by = y + 3;
    ui.pushButton('f--', 31, by, 4, '◄◄', step(-0.25));
    ui.pushButton('f-', 37, by, 3, '◄', step(-0.05));
    ui.pushButton('f+', 42, by, 3, '►', step(0.05));
    ui.pushButton('f++', 47, by, 4, '►►', step(0.25));
    ui.pushButton('a-', 55, by, 3, '▼', () => {
      this.a = Math.max(1, this.a - 1);
      term.sfx.blip(600);
    });
    ui.pushButton('a+', 60, by, 3, '▲', () => {
      this.a = Math.min(5, this.a + 1);
      term.sfx.blip(800);
    });
    ui.pushButton('listen', 67, by, 9, this.listen ? '♪ 监听中' : '♪ 监听', () => {
      this.listen = !this.listen;
    }, { active: this.listen });
    ui.text(31, by + 3, '频率', C.dim2);
    ui.text(55, by + 3, '振幅', C.dim2);
  },
};
