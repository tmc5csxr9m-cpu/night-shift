import { C, fit } from '../screen.js';
import { checksumGame } from '../games/checksum.js';
import { patchGame } from '../games/patch.js';
import { tuneGame } from '../games/tune.js';
import { memoryGame } from '../games/memory.js';

const GAMES = { 'T-01': checksumGame, 'T-02': patchGame, 'T-03': tuneGame, 'T-04': memoryGame };
const BENEFIT = {
  'T-01': '扫描准确率提升, 消除读数漂移',
  'T-02': '修复分区放音 (声音诱饵)',
  'T-03': '12 号节点读数准确',
  'T-04': '门灯继电器不再卡死, 灯管散热更快',
};
let selected = 0;

export const tasksPage = {
  path: 'C:\\SEC\\TASKS>',

  reset() {
    selected = 0;
    for (const g of Object.values(GAMES)) g.reset();
  },

  update(term, dt) {
    const t = term.world.tasks[selected];
    if (t) GAMES[t.id]?.update?.(term, dt);
  },

  complete(term, id) {
    const r = term.cmd('taskComplete', { id });
    if (r.ok === false) return;
    term.sfx.success();
    term.toast(`√ ${id} ${GAMES[id].name} 已完成 · ${BENEFIT[id]}`, 'info');
  },

  draw(term, ui) {
    const w = term.world;
    const tasks = w.tasks;
    ui.box(1, 2, 26, 27, { title: '值班任务 TASKS', titleAlign: 'left', style: 'double' });
    if (!tasks.length) {
      ui.text(3, 4, '今晚没有任务.', C.dim);
      return;
    }
    if (selected >= tasks.length) selected = 0;
    tasks.forEach((t, i) => {
      const g = GAMES[t.id];
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
      ui.text(9, y, fit(g.name, 14), C.hi, bg);
      ui.text(3, y + 1, fit(g.en, 15), C.dim, bg);
      const open = w.taskOpen(t);
      ui.text(19, y + 1, t.done ? '[完成]' : open ? '[待办]' : `[${String(t.open).padStart(2, '0')}:00]`, t.done ? C.ok : open ? C.yel : C.dim, bg);
      if (sel) ui.text(25, y, '►', C.yel, bg);
    });
    const done = tasks.filter((t) => t.done).length;
    ui.hline(2, 21, 24, '─', C.dim2);
    ui.text(3, 22, `进度 ${done}/${tasks.length}`, C.fg);
    ui.bar(3, 23, 22, done / tasks.length, { fg: C.cy, blocky: true });
    ui.text(3, 25, '截止时间', C.dim);
    ui.text(12, 25, w.overtime ? '已超时!' : '06:00 AM', w.overtime ? C.red : C.yel);
    ui.text(3, 26, '未完成 = 加班到 06:30', C.dim);
    ui.text(3, 27, '加班仍未完成 = 解雇', C.dim);

    const t = tasks[selected];
    const g = GAMES[t.id];
    ui.box(28, 2, 51, 27, { title: `${t.id} ${g.name}`, titleAlign: 'left' });
    ui.text(30, 3, fit(`${g.desc}  完成后: ${BENEFIT[t.id]}`, 47), C.dim);
    ui.hline(29, 4, 49, '─', C.dim2);
    if (!w.taskOpen(t) && !t.done) {
      ui.box(36, 10, 35, 7, { style: 'double', fg: C.dim, shadow: true });
      ui.center(12, `${t.id} 将于 ${String(t.open).padStart(2, '0')}:00 开放`, C.fg, null, 36, 35);
      ui.center(14, '先处理其他任务, 或者守好门.', C.dim, null, 36, 35);
      return;
    }
    g.draw(term, ui, () => this.complete(term, t.id));
    if (t.done) {
      ui.box(41, 24, 25, 4, { style: 'double', fg: C.ok, shadow: true });
      ui.text(43, 25, '√ 任务已完成', C.ok);
    }
  },
};
