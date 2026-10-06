// T-05: music box winder maintenance. Light the gears in order of their
// tooth count, smallest first. Two rounds; a wrong gear resets the round.
import { C } from '../screen.js';

const N = 6;
const ROUNDS = 2;
const POS = [[33, 7], [47, 7], [61, 7], [33, 14], [47, 14], [61, 14]];

function gearArt(teeth, lit) {
  const t = lit ? '█' : '▓';
  return [` ▄${t}▄${t}▄ `, `${t}▀▀▀▀▀${t}`, `█ ${String(teeth).padStart(2, '0')}  █`, `${t}▄▄▄▄▄${t}`, ` ▀${t}▀${t}▀ `];
}

export const gearsGame = {
  id: 'T-05',
  name: '发条维护',
  en: 'WINDER SERVICE',
  desc: '按齿数从少到多依次点亮齿轮. 点错本轮重来.',

  reset() {
    this.round = 0;
    this.newRound();
  },

  newRound() {
    const set = new Set();
    while (set.size < N) set.add(8 + Math.floor(Math.random() * 40));
    this.teeth = [...set].sort(() => Math.random() - 0.5);
    this.lit = new Set();
    this.err = 0;
  },

  update(term, dt) {
    if (this.err > 0) this.err -= dt;
  },

  draw(term, ui, complete) {
    if (this.round >= ROUNDS) return;
    const order = [...this.teeth].sort((a, b) => a - b);
    const next = order[this.lit.size];
    ui.text(31, 5, `轮次 ${this.round + 1}/${ROUNDS}`, C.fg);
    ui.text(45, 5, `已点亮 ${this.lit.size}/${N}`, C.fg);
    if (this.err > 0) ui.text(62, 5, '顺序错误!', C.red);
    POS.forEach(([x, y], i) => {
      const lit = this.lit.has(i);
      const hov = ui.hit(`gear-${i}`, x, y, 9, 5, () => {
        if (lit) return;
        if (this.teeth[i] === next) {
          this.lit.add(i);
          term.sfx.blip(600 + this.lit.size * 120);
          if (this.lit.size === N) {
            this.round++;
            term.sfx.ok();
            if (this.round >= ROUNDS) complete();
            else {
              this.newRound();
              term.reprint();
            }
          }
        } else {
          this.lit.clear();
          this.err = 0.6;
          term.sfx.error();
        }
      });
      ui.art(x, y, gearArt(this.teeth[i], lit), lit ? C.yel : hov ? C.hi : C.cy);
    });
    ui.text(31, 21, '提示: 数字是齿数. 齿越少的齿轮越先装.', C.dim);
  },
};
