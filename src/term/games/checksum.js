// T-01: find every occurrence of the target byte in a memory dump.
import { C } from '../screen.js';

const COLS = 8;
const ROWS = 6;
const NEED = 4;
const ROUNDS = 3;

const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');

export const checksumGame = {
  id: 'T-01',
  name: '数据校验',
  en: 'CHECKSUM AUDIT',
  desc: '在内存转储中找出所有目标字节, 共三轮.',

  reset() {
    this.round = 0;
    this.errors = 0;
    this.newRound();
  },

  newRound() {
    this.target = 16 + Math.floor(Math.random() * 230);
    this.bytes = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      let v;
      do v = Math.floor(Math.random() * 256);
      while (v === this.target);
      // decoys that share a digit make it harder
      if (Math.random() < 0.25) v = (this.target & 0xf0) | Math.floor(Math.random() * 16);
      if (v === this.target) v ^= 1;
      this.bytes.push(v);
    }
    const idx = new Set();
    while (idx.size < NEED) idx.add(Math.floor(Math.random() * this.bytes.length));
    for (const i of idx) this.bytes[i] = this.target;
    this.found = new Set();
    this.bad = -1;
    this.badT = 0;
    this.base = 0x4000 + Math.floor(Math.random() * 0x3000) * 16;
  },

  update(term, dt) {
    if (this.badT > 0) this.badT -= dt;
  },

  draw(term, ui, complete) {
    const finished = this.round >= ROUNDS;
    ui.text(30, 6, '目标字节', C.dim);
    ui.text(39, 6, finished ? '----' : `0x${hex(this.target)}`, C.yel);
    ui.text(46, 6, `已找到 ${this.found.size}/${NEED}`, C.fg);
    ui.text(60, 6, `轮次 ${Math.min(this.round + 1, ROUNDS)}/${ROUNDS}`, C.fg);
    ui.text(72, 6, `误${this.errors}`, this.errors ? C.red : C.dim);

    ui.text(31, 8, 'ADDR   ', C.dim2);
    for (let c = 0; c < COLS; c++) ui.text(38 + c * 3, 8, `+${c}`, C.dim2);
    ui.text(63, 8, 'ASCII', C.dim2);
    for (let r = 0; r < ROWS; r++) {
      const y = 9 + r * 2;
      ui.text(31, y, `${(this.base + r * COLS).toString(16).toUpperCase()}:`, C.dim);
      let ascii = '';
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const v = this.bytes[i];
        const x = 38 + c * 3;
        const got = this.found.has(i);
        const isBad = this.bad === i && this.badT > 0;
        const hov = ui.hit(`cs-${i}`, x, y, 2, 1, () => {
          if (finished || got) return;
          if (v === this.target) {
            this.found.add(i);
            term.sfx.blip(1200);
            if (this.found.size >= NEED) {
              this.round++;
              term.sfx.ok();
              if (this.round >= ROUNDS) complete();
              else {
                this.newRound();
                term.reprint();
              }
            }
          } else {
            this.errors++;
            this.bad = i;
            this.badT = 0.4;
            term.sfx.error();
          }
        });
        let fg = C.fg;
        let bg;
        if (got) {
          fg = C.ink;
          bg = C.cy;
        }
        if (isBad) {
          fg = C.hi;
          bg = C.red;
        }
        if (hov && !got) {
          fg = C.ink;
          bg = C.hi;
        }
        ui.text(x, y, hex(v), fg, bg);
        ascii += v >= 33 && v < 127 ? String.fromCharCode(v) : '.';
      }
      ui.text(63, y, ascii, C.dim2);
    }
    if (!finished) ui.text(31, 21, '提示: 点击与目标相同的字节. 点错会被记录.', C.dim);
  },
};
