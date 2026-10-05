// Shift report printed after a night ends (win / death / fired).
import { C, COLS, fit } from '../screen.js';
import { game } from '../../game.js';
import { save } from '../../save.js';
import { ACTOR_NAMES } from '../../sim/index.js';

const HINTS = {
  sunny: '左门的熊: 在门口被门灯照住 2.5 秒就会离开.',
  pip: '右门的兔子不怕灯. 在它附近的房间放声音诱饵, 或者落下卷帘.',
  tootie: '音乐盒一停, 员工室里的东西就会冲过来. 别断开广播回路 C7.',
  power: '留意电力储备. 舞台确认没人后可以断开 C9 省电.',
};

export const resultPage = {
  draw(term, ui) {
    const w = game.world;
    if (!w || !w.result) return;
    const r = w.result;
    ui.fill(0, 0, COLS, 30, C.bg);
    const win = r.outcome === 'win';
    const fired = r.outcome === 'fired';
    const head = win ? '班次结束' : fired ? '解雇通知' : '值班中断';
    const col = win ? C.ok : fired ? C.yel : C.red;
    ui.fill(0, 0, COLS, 1, win ? C.inv : '#5a0606');
    ui.text(1, 0, `SEC-OS 班次报告 · ${game.nightName(game.night)}`, win ? C.ink : C.hi, win ? C.inv : '#5a0606');
    if (game.debug) ui.text(COLS - 8, 0, ' DEBUG ', C.hi, '#a01010');
    ui.bigText(4, 2, win ? (r.overtime ? '6:30' : '6:00') : r.clock.replace(/^0/, ''), col);
    ui.text(26, 2, head, col);
    ui.text(26, 3, win ? (r.overtime ? '加班完成 (无加班费)' : '准时交班') : fired ? '06:30 交班清单仍未完成' : `死因: ${ACTOR_NAMES[r.cause] || r.cause}`, C.fg);

    ui.box(3, 7, 46, 16, { title: '统计', titleAlign: 'left' });
    const done = w.tasks.filter((t) => t.done).length;
    const rows = [
      ['存活时间', w.clock() + (w.overtime ? ' (加班)' : '')],
      ['剩余电力', `${w.powerPct().toFixed(1)}%   最低 ${w.stats.minPower.toFixed(1)}%`],
      ['完成任务', `${done}/${w.tasks.length}`],
      ['击退次数', Object.entries(w.stats.repels).map(([k, v]) => `${ACTOR_NAMES[k] || k}×${v}`).join(' ') || '—'],
      ['烧坏灯管', `${w.stats.burned}   剩余备件 ${w.spares}`],
      ['运动扫描', `${w.stats.scans} 次   声音诱饵 ${w.stats.lures} 次`],
      ['种子', `${w.seed}`],
    ];
    rows.forEach(([k, v], i) => {
      ui.text(5, 9 + i * 2, k, C.dim);
      ui.text(15, 9 + i * 2, fit(v, 32), C.fg);
    });

    ui.box(51, 7, 26, 16, { title: '评价', titleAlign: 'left' });
    if (win) {
      const s1 = true;
      const s2 = !r.overtime;
      const s3 = w.powerPct() >= 15 && w.stats.burned === 0;
      [[s1, '通关'], [s2, '无加班'], [s3, '电力≥15% 且无烧坏']].forEach(([ok, label], i) => {
        ui.text(53, 9 + i * 2, ok ? '★' : '☆', ok ? C.yel : C.dim2);
        ui.text(56, 9 + i * 2, label, ok ? C.fg : C.dim);
      });
      if (game.debug) ui.text(53, 16, '调试模式: 不计入存档', C.dim);
      else if (game.night === save.data.progress.maxNightCleared && game.night < 6) ui.text(53, 16, `已解锁 第 ${game.night + 1} 夜`, C.ok);
    } else {
      ui.text(53, 9, '提示', C.yel);
      const hint = fired ? '任务没做完就要加班; 加班到 06:30 仍未完成会被解雇.' : HINTS[r.cause] || '';
      const words = [...hint];
      let line = '';
      let y = 10;
      for (const ch of words) {
        line += ch;
        if (line.length >= 10) {
          ui.text(53, y++, line, C.fg);
          line = '';
        }
      }
      if (line) ui.text(53, y, line, C.fg);
    }

    let x = 14;
    if (win && game.night < 6) {
      ui.pushButton('r-next', x, 25, 16, '▶ 下一夜', () => term.actions.start(game.night + 1, game.debug));
      x += 20;
    }
    ui.pushButton('r-retry', x, 25, 16, win ? '再玩一次' : '↻ 重试', () => term.actions.start(game.night, game.debug));
    x += 20;
    ui.pushButton('r-menu', x, 25, 16, '主菜单', () => term.actions.menu());
  },
};
