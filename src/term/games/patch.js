// T-02: patch bay. Connect each left jack to the right jack with the same code.
import { C } from '../screen.js';

const N = 5;
const CODES = ['7F', 'C2', '3A', 'E9', '51', 'B4', '0D', '96'];
const WIRE = ['#7fe3ff', '#ffe56b', '#8affd0', '#ff9df0', '#ffb36b'];
const LX = 31;
const RX = 70;
const Y0 = 7;
const DY = 3;

export const patchGame = {
  id: 'T-02',
  name: '线路接驳',
  en: 'PATCH BAY',
  desc: '把左侧接口连到编码相同的右侧接口, 恢复后厨线路.',

  reset() {
    const codes = [...CODES].sort(() => Math.random() - 0.5).slice(0, N);
    this.left = codes;
    this.right = [...codes].sort(() => Math.random() - 0.5);
    this.links = new Array(N).fill(-1); // left i -> right j
    this.sel = -1;
    this.errT = 0;
  },

  update(term, dt) {
    if (this.errT > 0) this.errT -= dt;
  },

  draw(term, ui, complete) {
    const done = this.links.every((l) => l >= 0);
    ui.text(31, 5, '源 SOURCE', C.dim);
    ui.text(66, 5, '目标 DEST', C.dim);

    // wires first, so jacks draw over them
    this.links.forEach((j, i) => {
      if (j < 0) return;
      const y1 = Y0 + i * DY;
      const y2 = Y0 + j * DY;
      const mx = 42 + i * 5;
      const col = WIRE[i];
      for (let x = LX + 6; x < mx; x++) ui.s.set(x, y1, '─', col);
      for (let x = mx + 1; x < RX - 1; x++) ui.s.set(x, y2, '─', col);
      if (y1 === y2) ui.s.set(mx, y1, '─', col);
      else {
        const down = y2 > y1;
        ui.s.set(mx, y1, down ? '┐' : '┘', col);
        ui.s.set(mx, y2, down ? '└' : '┌', col);
        for (let y = Math.min(y1, y2) + 1; y < Math.max(y1, y2); y++) ui.s.set(mx, y, '│', col);
      }
    });

    for (let i = 0; i < N; i++) {
      const y = Y0 + i * DY;
      const linked = this.links[i] >= 0;
      const sel = this.sel === i;
      const blink = sel && Math.floor(term.time * 4) % 2;
      const hov = ui.hit(`pl-${i}`, LX, y, 6, 1, () => {
        if (linked || done) return;
        this.sel = i;
        term.sfx.select();
      });
      const fg = linked ? WIRE[i] : sel ? C.ink : hov ? C.ink : C.hi;
      const bg = sel ? (blink ? C.yel : C.cy) : hov && !linked ? C.hi : C.bg2;
      ui.text(LX, y, ` ${this.left[i]} `, fg, bg);
      ui.text(LX + 4, y, linked ? '●' : '○', linked ? WIRE[i] : C.dim);
      ui.text(LX, y + 1, `J${i + 1}`, C.dim2);
    }
    for (let j = 0; j < N; j++) {
      const y = Y0 + j * DY;
      const taken = this.links.indexOf(j);
      const err = this.errT > 0 && this.errJ === j;
      const hov = ui.hit(`pr-${j}`, RX - 1, y, 6, 1, () => {
        if (this.sel < 0 || taken >= 0) return;
        if (this.right[j] === this.left[this.sel]) {
          this.links[this.sel] = j;
          this.sel = -1;
          term.sfx.on();
          if (this.links.every((l) => l >= 0)) complete();
        } else {
          this.errJ = j;
          this.errT = 0.4;
          term.sfx.error();
        }
      });
      ui.text(RX - 1, y, taken >= 0 ? '●' : '○', taken >= 0 ? WIRE[taken] : C.dim);
      const fg = err ? C.hi : taken >= 0 ? WIRE[taken] : hov ? C.ink : C.hi;
      const bg = err ? C.red : hov && taken < 0 && this.sel >= 0 ? C.hi : C.bg2;
      ui.text(RX + 1, y, ` ${this.right[j]} `, fg, bg);
      ui.text(RX + 1, y + 1, `P${j + 1}`, C.dim2);
    }
    if (!done) {
      ui.text(31, 22, this.sel < 0 ? '1. 点击左侧接口' : `2. 选择编码为 ${this.left[this.sel]} 的目标接口`, C.dim);
    }
  },
};
