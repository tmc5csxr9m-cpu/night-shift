// 值班手册: list of topics on the left, the text on the right. Used from the
// main menu and, during a shift, from the "?" tab (the clock keeps running).
import { C, fit, wrap } from '../screen.js';
import { save } from '../../save.js';
import { game } from '../../game.js';
import { MANUAL } from '../../data/manual.js';

let selected = 'basics';

function unlocked(entry) {
  if (save.data.settings.debug || game.debug) return true;
  const reached = Math.max(save.data.progress.currentNight, game.world ? game.night : 0);
  return entry.night <= reached;
}

export function drawManual(term, ui, { x, y, w, h }) {
  const LIST_W = 20;
  ui.box(x, y, LIST_W, h, { title: '值班手册', titleAlign: 'left' });
  MANUAL.forEach((e, i) => {
    const yy = y + 1 + i;
    if (yy >= y + h - 1) return;
    const open = unlocked(e);
    const active = e.id === selected;
    const label = open ? e.title : `？？？ 第${e.night}夜`;
    const hov = ui.hit('man-' + e.id, x + 1, yy, LIST_W - 2, 1, () => {
      if (!open) return;
      selected = e.id;
      term.reprint();
    });
    const fg = !open ? C.dim2 : active || hov ? C.ink : C.fg;
    const bg = active ? C.cy : hov && open ? C.hi : undefined;
    ui.text(x + 1, yy, fit(` ${label}`, LIST_W - 2), fg, bg);
  });

  const e = MANUAL.find((m) => m.id === selected && unlocked(m)) || MANUAL[0];
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
