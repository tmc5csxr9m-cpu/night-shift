// T-06: generator ignition. 1) hold to preheat the glow plugs, 2) fire when
// the swinging needle is in the green, 3) keep the RPM inside the band.
// A mistimed ignition backfires — a very loud bang in the power room.
import { C } from '../screen.js';

export const ignitionGame = {
  id: 'T-06',
  name: '发电机点火',
  en: 'GENERATOR START',
  desc: '预热 → 在绿区点火 → 稳住转速. 点火失败会在配电室发出巨响.',

  reset() {
    this.stage = 0;
    this.heat = 0;
    this.needle = 0;
    this.rpm = 0.5;
    this.hold = 0;
    this.msg = '';
  },

  update(term, dt) {
    if (this.stage === 1) this.needle = (Math.sin(term.time * 2.6) + 1) / 2;
    if (this.stage === 2) {
      // the engine wanders; taps correct it
      this.rpm += (Math.sin(term.time * 1.7) * 0.18 + (Math.random() - 0.5) * 0.3) * dt;
      this.rpm = Math.max(0, Math.min(1, this.rpm));
      if (this.rpm > 0.4 && this.rpm < 0.62) this.hold += dt;
      else this.hold = Math.max(0, this.hold - dt * 0.5);
      if (this.hold >= 4) {
        this.stage = 3;
        this.complete?.();
      }
    }
  },

  draw(term, ui, complete) {
    this.complete = complete;
    const steps = ['预热', '点火', '稳压'];
    steps.forEach((s, i) => ui.text(33 + i * 14, 6, `${i + 1}.${s}`, i === this.stage ? C.yel : i < this.stage ? C.ok : C.dim));
    if (this.stage === 0) {
      ui.text(33, 9, '按住按钮给电热塞预热', C.fg);
      ui.bar(33, 11, 40, this.heat, { fg: C.yel });
      ui.pushButton('gen-heat', 33, 14, 18, '▒ 预热 (按住)', null, {
        onHold: (dt) => {
          this.heat = Math.min(1, this.heat + dt / 3);
          if (this.heat >= 1) {
            this.stage = 1;
            term.sfx.ok();
          }
        },
      });
    } else if (this.stage === 1) {
      ui.text(33, 9, '指针进入绿区时点火', C.fg);
      const W = 40;
      for (let i = 0; i < W; i++) {
        const green = i >= 26 && i <= 31;
        ui.s.set(33 + i, 11, '▄', green ? C.ok : C.dim2, C.bg2);
      }
      ui.s.set(33 + Math.round(this.needle * (W - 1)), 11, '▲', C.hi, C.bg2);
      ui.pushButton('gen-fire', 33, 14, 18, '◉ 点火', () => {
        const pos = Math.round(this.needle * (W - 1));
        if (pos >= 26 && pos <= 31) {
          this.stage = 2;
          term.sfx.on();
        } else {
          this.msg = '回火! 重新点火';
          term.sfx.error();
          term.actions?.backfire?.();
        }
      });
      if (this.msg) ui.text(55, 14, this.msg, C.red);
    } else if (this.stage === 2) {
      ui.text(33, 9, '用 ◄ ► 把转速稳在区间内 4 秒', C.fg);
      const W = 40;
      for (let i = 0; i < W; i++) {
        const band = i >= 16 && i <= 24;
        ui.s.set(33 + i, 11, '░', band ? C.ok : C.dim2, C.bg2);
      }
      ui.s.set(33 + Math.round(this.rpm * (W - 1)), 11, '█', C.hi, C.bg2);
      ui.bar(33, 13, 40, this.hold / 4, { fg: C.ok });
      ui.pushButton('rpm-', 33, 15, 6, '◄', () => (this.rpm = Math.max(0, this.rpm - 0.06)));
      ui.pushButton('rpm+', 42, 15, 6, '►', () => (this.rpm = Math.min(1, this.rpm + 0.06)));
    }
  },
};
