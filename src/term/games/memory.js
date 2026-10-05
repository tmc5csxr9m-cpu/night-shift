// T-04: the old alarm panel test. Watch the pads + buzzer, repeat the order.
import { C } from '../screen.js';

const PADS = [
  { x: 36, y: 7, f: 330, n: '1' },
  { x: 55, y: 7, f: 415, n: '2' },
  { x: 36, y: 14, f: 494, n: '3' },
  { x: 55, y: 14, f: 622, n: '4' },
];
const PW = 16;
const PH = 6;
const LENGTHS = [3, 4, 5];

export const memoryGame = {
  id: 'T-04',
  name: '警报面板自检',
  en: 'ALARM PANEL TEST',
  desc: '观察面板闪烁与蜂鸣顺序, 按相同顺序复现. 共三轮.',

  reset() {
    this.mode = 'idle';
    this.level = 0;
    this.seq = [];
    this.pos = 0;
    this.t = 0;
    this.lit = -1;
    this.litT = 0;
    this.msg = '';
  },

  start(term) {
    const len = LENGTHS[this.level];
    this.seq = Array.from({ length: len }, () => Math.floor(Math.random() * 4));
    this.mode = 'show';
    this.pos = 0;
    this.t = -0.6;
    this.msg = '';
    term.sfx.page();
  },

  update(term, dt) {
    if (this.litT > 0) {
      this.litT -= dt;
      if (this.litT <= 0) this.lit = -1;
    }
    if (this.mode === 'show') {
      this.t += dt;
      if (this.t >= 0.55) {
        this.t = 0;
        if (this.pos < this.seq.length) {
          const p = this.seq[this.pos++];
          this.flash(term, p);
        } else {
          this.mode = 'input';
          this.pos = 0;
        }
      }
    }
  },

  flash(term, p) {
    this.lit = p;
    this.litT = 0.35;
    term.sfx.tone(PADS[p].f, 0.3, 0.5);
  },

  press(term, p, complete) {
    if (this.mode !== 'input') return;
    this.flash(term, p);
    if (this.seq[this.pos] === p) {
      this.pos++;
      if (this.pos >= this.seq.length) {
        this.level++;
        if (this.level >= LENGTHS.length) {
          this.mode = 'done';
          complete();
        } else {
          this.mode = 'idle';
          this.msg = '正确. 下一轮.';
          term.sfx.ok();
        }
      }
    } else {
      this.mode = 'idle';
      this.msg = '顺序错误. 重新开始本轮.';
      setTimeout(() => term.sfx.error(), 250);
    }
  },

  draw(term, ui, complete) {
    PADS.forEach((p, i) => {
      const lit = this.lit === i;
      const hov = ui.hit(`pad-${i}`, p.x, p.y, PW, PH, () => this.press(term, i, complete), {
        disabled: this.mode !== 'input',
      });
      const bg = lit ? C.hi : hov ? C.bg3 : C.bg2;
      ui.box(p.x, p.y, PW, PH, { style: lit ? 'double' : 'single', fg: lit ? C.ink : C.fg, bg, shadow: !lit });
      ui.bigText(p.x + 6, p.y + 1, p.n, lit ? C.ink : C.cy, bg);
      ui.text(p.x + 5, p.y + 4, `${p.f}Hz`, lit ? C.ink : C.dim, bg);
    });
    ui.text(31, 6, `轮次 ${Math.min(this.level + 1, 3)}/3`, C.fg);
    const status = {
      idle: '等待开始',
      show: '播放中... 注意观察',
      input: `请复现 ${this.pos}/${this.seq.length}`,
      done: '自检通过',
    }[this.mode];
    ui.text(31, 21, status, this.mode === 'input' ? C.yel : C.fg);
    if (this.msg) ui.text(31, 22, this.msg, C.dim);
    if (this.mode === 'idle') ui.pushButton('mem-start', 62, 21, 12, '▶ 开始', () => this.start(term));
  },
};
