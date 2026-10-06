// T-07: compressor restart. Close the valve with the highest pressure; the
// rest redistribute. When all branch valves are closed, open the main valve.
import { C } from '../screen.js';

const N = 5;

export const valvesGame = {
  id: 'T-07',
  name: '压缩机重启',
  en: 'COMPRESSOR RESTART',
  desc: '每次关闭压力最高的阀门(压力会重新分配), 全部关闭后打开主阀.',

  reset() {
    this.p = Array.from({ length: N }, () => 20 + Math.floor(Math.random() * 70));
    this.closed = new Set();
    this.main = false;
    this.err = 0;
  },

  update(term, dt) {
    if (this.err > 0) this.err -= dt;
  },

  draw(term, ui, complete) {
    ui.text(31, 5, '冷库压缩机 · 分支阀门压力 (kPa)', C.fg);
    if (this.err > 0) ui.text(62, 5, '压力冲击!', C.red);
    const open = [...Array(N).keys()].filter((i) => !this.closed.has(i));
    const maxP = Math.max(...open.map((i) => this.p[i]));
    for (let i = 0; i < N; i++) {
      const x = 33 + i * 9;
      const y = 8;
      const shut = this.closed.has(i);
      // pressure column
      const h = Math.round((this.p[i] / 100) * 8);
      for (let r = 0; r < 8; r++) ui.s.set(x + 2, y + 8 - r, r < h && !shut ? '█' : '░', shut ? C.dim2 : this.p[i] > 75 ? C.red : C.cy);
      ui.text(x, y + 9, shut ? ' --- ' : `${String(this.p[i]).padStart(3)}  `, shut ? C.dim2 : C.fg);
      ui.button(`valve-${i}`, x, y + 11, shut ? '已关' : `V${i + 1}`, () => {
        if (shut || this.main) return;
        if (this.p[i] !== maxP) {
          // wrong valve: a pressure spike, one closed valve pops open
          this.err = 0.6;
          term.sfx.error();
          const c = [...this.closed];
          if (c.length) this.closed.delete(c[Math.floor(Math.random() * c.length)]);
          return;
        }
        this.closed.add(i);
        term.sfx.on();
        // redistribute: the remaining branches take some of the load
        for (const j of [...Array(N).keys()]) if (!this.closed.has(j)) this.p[j] = Math.max(5, Math.min(99, this.p[j] + Math.floor((Math.random() - 0.35) * 30)));
      }, { disabled: shut });
    }
    const allShut = this.closed.size === N;
    ui.pushButton('valve-main', 44, 23, 16, this.main ? '主阀已开' : '◉ 打开主阀', () => {
      if (!allShut) {
        this.err = 0.6;
        term.sfx.error();
        return;
      }
      this.main = true;
      complete();
    }, { disabled: this.main, active: allShut && !this.main });
  },
};
