// Shift report printed after a night ends: passed (win), checklist
// unfinished at 06:00 (fired) or dead. The big clock is how long you lasted:
// 6:00 in the normal colour if you made it, the time of death in red if not.
import { C, COLS, fit } from '../screen.js';
import { game } from '../../game.js';
import { save } from '../../save.js';
import { ACTOR_NAMES } from '../../sim/index.js';

const HINTS = {
  sunny: '左门的熊: 开左门灯, 再转头盯住它约 2 秒, 它才会退.',
  pip: '门灯只能让兔子停下. 在它附近的房间放声音诱饵, 或落下 08 卷帘.',
  tootie: '音乐盒一停, 员工室里的东西就会冲过来. 盯住发条, 别断开广播回路 C7.',
  power: '留意电力储备. 舞台确认没人后可以断开 C9 省电.',
  chef: '冷库断电会唤醒大厨. 门灯对它没用, 在 05 后厨放诱饵(出餐铃)能把它叫回去.',
  back: '听背后的拖拽声. 它到了门口就上磁锁, 锁住约 4 秒它就放弃.',
  ribbon: '管道里的刮擦声 = 通风口. 通风开到 3 档并保持几秒能把它吹回去.',
  fired: '06:00 前必须完成交班清单. 任务按时间开放, 开放后尽早做.',
};

function wrapCols(text, width) {
  const out = [];
  let line = '';
  let w = 0;
  for (const ch of text) {
    const cw = ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
    if (w + cw > width) {
      out.push(line);
      line = '';
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line) out.push(line);
  return out;
}

export const resultPage = {
  draw(term, ui) {
    const w = game.world;
    if (!w || !w.result) return;
    const r = w.result;
    ui.fill(0, 0, COLS, 30, C.bg);
    const win = r.outcome === 'win';
    const fired = r.outcome === 'fired';
    const alive = win || fired;
    const head = win ? '班次结束' : fired ? '考核未通过' : '值班中断';
    const col = win ? C.ok : fired ? C.yel : C.red;
    ui.fill(0, 0, COLS, 1, alive ? C.inv : '#5a0606');
    ui.text(1, 0, `SEC-OS 班次报告 · ${game.nightName(game.night)}`, alive ? C.ink : C.hi, alive ? C.inv : '#5a0606');
    if (game.debug) ui.text(COLS - 8, 0, ' DEBUG ', C.hi, '#a01010');
    // how long you lasted: 6:00 if you made it (normal colour), else the time of death in red
    ui.bigText(4, 2, alive ? '6:00' : r.clock.replace(/^0/, ''), alive ? C.hi : C.red);
    ui.text(26, 2, head, col);
    const sub = win ? (game.night === 6 ? 'STARLIGHT.EXE 已删除' : '准时交班') : fired ? '交班清单未完成' : `死因: ${ACTOR_NAMES[r.cause] || r.cause}`;
    ui.text(26, 3, sub, C.fg);

    ui.box(3, 7, 46, 16, { title: '统计', titleAlign: 'left' });
    const req = w.tasks.filter((t) => !t.optional);
    const done = req.filter((t) => t.done).length;
    const rows = [
      ['存活时间', alive ? '06:00 · 撑到了天亮' : `${r.clock}${r.stuck ? ' (时间停止)' : ''}`, alive ? C.fg : C.red],
      ['剩余电力', `${w.powerPct().toFixed(1)}%   最低 ${w.stats.minPower.toFixed(1)}%`],
      ['交班清单', `${done}/${req.length}`, done < req.length ? C.yel : C.fg],
      ['击退次数', Object.entries(w.stats.repels).map(([k, v]) => `${ACTOR_NAMES[k] || k}×${v}`).join(' ') || '—'],
      ['烧坏灯管', `${w.stats.burned}   剩余备件 ${w.spares}`],
      ['运动扫描', `${w.stats.scans} 次   声音诱饵 ${w.stats.lures} 次`],
      ['种子', `${w.seed}`],
    ];
    rows.forEach(([k, v, fg], i) => {
      ui.text(5, 9 + i * 2, k, C.dim);
      ui.text(15, 9 + i * 2, fit(v, 32), fg || C.fg);
    });

    ui.box(51, 7, 26, 16, { title: win ? '记录' : '提示', titleAlign: 'left' });
    if (win) {
      const rec = save.data.nights[game.night];
      ui.text(53, 9, `√ ${game.nightName(game.night)} 通过`, C.ok);
      if (rec && !game.debug) ui.text(53, 11, `共值班 ${rec.attempts} 次`, C.dim);
      if (game.debug) ui.text(53, 13, '调试模式: 不计入存档', C.dim);
      else if (game.night === save.data.progress.maxNightCleared && game.night < 6) ui.text(53, 13, `已解锁 第 ${game.night + 1} 夜`, C.ok);
      else if (game.night === 6) ui.text(53, 13, '全部夜晚已通过.', C.yel);
    } else {
      const hint = fired ? HINTS.fired : HINTS[r.cause] || '';
      wrapCols(hint, 22).slice(0, 12).forEach((l, i) => ui.text(53, 9 + i, l, C.fg));
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
