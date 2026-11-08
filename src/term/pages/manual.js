// 值班手册: list of topics on the left, the text on the right. Used from the
// main menu and, during a shift, from the "?" tab (the clock keeps running).
// Every entry is open from the start (there is no tutorial call any more).
import { C, fit, wrap } from '../screen.js';
import { MANUAL } from '../../data/manual.js';

let selected = 'basics';

export function drawManual(term, ui, { x, y, w, h }) {
  const LIST_W = 20;
  ui.box(x, y, LIST_W, h, { title: '值班手册', titleAlign: 'left' });
  MANUAL.forEach((e, i) => {
    const yy = y + 1 + i;
    if (yy >= y + h - 1) return;
    const active = e.id === selected;
    const hov = ui.hit('man-' + e.id, x + 1, yy, LIST_W - 2, 1, () => {
      selected = e.id;
      term.reprint();
    });
    const fg = active || hov ? C.ink : C.fg;
    const bg = active ? C.cy : hov ? C.hi : undefined;
    ui.text(x + 1, yy, fit(` ${e.title}`, LIST_W - 2), fg, bg);
  });

  const e = MANUAL.find((m) => m.id === selected) || MANUAL[0];
  const bx = x + LIST_W + 1;
  const bw = w - LIST_W - 1;
  ui.box(bx, y, bw, h, { title: e.title, titleAlign: 'left', style: 'double' });
  let yy = y + 2;
  const tw = bw - 4;
  for (const para of e.body) {
    for (const line of wrap(para, tw)) {
      if (yy >= y + h - 1) break;
      ui.text(bx + 2, yy++, line, C.fg);
    }
    yy++;
  }
}

export const manualPage = {
  draw(term, ui) {
    drawManual(term, ui, { x: 1, y: 2, w: 78, h: 26 });
  },
};
