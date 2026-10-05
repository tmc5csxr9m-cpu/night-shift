import { C, fit } from '../screen.js';
import { state, log } from '../../state.js';
import { checksumGame } from '../games/checksum.js';
import { patchGame } from '../games/patch.js';
import { tuneGame } from '../games/tune.js';
import { memoryGame } from '../games/memory.js';

const GAMES = [checksumGame, patchGame, tuneGame, memoryGame];
let selected = 0;

export const tasksPage = {
  path: 'C:\\SEC\\TASKS>',

  init() {
    state.tasks = GAMES.map((g) => ({ id: g.id, name: g.name, en: g.en, done: false }));
    GAMES.forEach((g) => g.reset());
  },

  update(term, dt) {
    const g = GAMES[selected];
    g.update?.(term, dt);
  },

  complete(term, i) {
    const t = state.tasks[i];
    if (t.done) return;
    t.done = true;
    term.sfx.success();
    log(`任务 ${t.id} ${t.name} 已完成.`);
    term.toast(`√ ${t.id} ${t.name} 已完成`, 'info');
  },

  draw(term, ui) {
    // ------------------------------------------- task list
    ui.box(1, 2, 26, 27, { title: '值班任务 TASKS', titleAlign: 'left', style: 'double' });
    GAMES.forEach((g, i) => {
      const t = state.tasks[i];
      const y = 4 + i * 4;
      const sel = i === selected;
      const hov = ui.hit('task-' + i, 2, y, 24, 3, () => {
        if (selected !== i) {
          selected = i;
          term.reprint();
          term.sfx.select();
        }
      });
      const bg = sel ? C.bg3 : hov ? C.bg2 : undefined;
      if (bg) ui.fill(2, y, 24, 3, bg);
      ui.text(3, y, t.id, sel ? C.yel : C.cy, bg);
      ui.text(9, y, fit(t.name, 12), C.hi, bg);
      ui.text(3, y + 1, fit(t.en, 16), C.dim, bg);
      if (t.done) ui.text(19, y + 1, '[完成]', C.ok, bg);
      else ui.text(19, y + 1, '[待办]', C.yel, bg);
      if (sel) ui.text(25, y, '►', C.yel, bg);
    });
    const done = state.tasks.filter((t) => t.done).length;
    ui.hline(2, 21, 24, '─', C.dim2);
    ui.text(3, 22, `进度 ${done}/${state.tasks.length}`, C.fg);
    ui.bar(3, 23, 22, done / state.tasks.length, { fg: C.cy, blocky: true });
    ui.text(3, 25, '截止时间', C.dim);
    ui.text(12, 25, '06:00 AM', C.yel);
    ui.text(3, 26, '未完成的任务将计入', C.dim);
    ui.text(3, 27, '值班考核.', C.dim);

    // ------------------------------------------- game area
    const g = GAMES[selected];
    const t = state.tasks[selected];
    ui.box(28, 2, 51, 27, { title: `${g.id} ${g.name}`, titleAlign: 'left' });
    ui.text(30, 3, fit(g.desc, 47), C.dim);
    ui.hline(29, 4, 49, '─', C.dim2);
    g.draw(term, ui, () => this.complete(term, selected));
    if (t.done) {
      ui.box(41, 24, 25, 4, { style: 'double', fg: C.ok, shadow: true });
      ui.text(43, 25, '√ 任务已完成', C.ok);
      ui.button('retry', 43, 26, '重新练习', () => {
        g.reset();
        term.reprint();
      });
    }
  },
};
