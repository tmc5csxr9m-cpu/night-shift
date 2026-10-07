import { C, COLS, fit, hhmm } from '../screen.js';
import { game } from '../../game.js';

const ICONS = {
  power: ['     ▄██▀ ', '    ██▀   ', '   ██████▀', '     ▄█▀  ', '    ▄▀    '],
  map: ['┌──┬────┬─┐', '│01│ 02 │ │', '├──┴─┬──┤ │', '│ 03 │◉ │ │', '└────┴──┴─┘'],
  facility: ['  ▄ ▄█▄ ▄ ', '  ▀█████▀ ', ' ▄██▀ ▀██▄', '  ▀██▄██▀ ', '  ▀ ▀█▀ ▀ '],
  tasks: ['┌────────┐', '│√ ════  │', '│√ ═════ │', '│▫ ═══   │', '└────────┘'],
};

const TILES = [
  { key: 'power', n: '1', title: '电力控制', en: 'POWER  DISTRIBUTION', x: 2, y: 7 },
  { key: 'map', n: '2', title: '设施地图', en: 'FACILITY  MAP', x: 41, y: 7 },
  { key: 'facility', n: '3', title: '设施控制', en: 'SYSTEMS  CONTROL', x: 2, y: 15 },
  { key: 'tasks', n: '4', title: '值班任务', en: 'SHIFT  TASKS', x: 41, y: 15 },
];

function status(key, w) {
  switch (key) {
    case 'power': {
      const on = Object.values(w.circuits).filter(Boolean).length;
      return [`储备 ${w.powerPct().toFixed(1)}% · ${w.power.load.toFixed(2)}kW`, w.power.tripped ? '!! 主闸跳闸 !!' : `回路 ${on}/10 闭合`];
    }
    case 'map': {
      const n = Object.values(w.rooms).filter((r) => r.sealed).length;
      const lit = Object.values(w.rooms).filter((r) => r.light).length;
      return [w.powered('C6') ? '传感节点 12/12 在线' : '传感网络离线', `封锁 ${n} · 照明 ${lit}`];
    }
    case 'facility': {
      const l = w.doorLit('L') ? '亮' : w.doors.L.broken ? '坏' : '灭';
      const r = w.doorLit('R') ? '亮' : w.doors.R.broken ? '坏' : '灭';
      return [`门灯 左${l} 右${r} 备件${w.spares}`, `风扇${w.office.fan ? '开' : '关'} 通风${w.office.vent} 发条${Math.round(w.musicBox.wind * 100)}%`];
    }
    case 'tasks': {
      const done = w.tasks.filter((t) => t.done).length;
      const next = w.tasks.find((t) => !t.done && !w.taskOpen(t));
      return [`进度 ${done}/${w.tasks.length} 已完成`, w.clockStuck ? '!! 时间停止 !!' : w.overtime ? '!! 加班中 !!' : next ? `${next.id} ${hhmm(next.open)} 开放` : '截止 06:00 AM'];
    }
  }
  return ['', ''];
}

export const homePage = {
  path: 'C:\\SEC\\MAIN>',

  draw(term, ui) {
    const w = term.world;
    ui.text(3, 3, '★', C.yel);
    ui.text(5, 3, 'STARLIGHT PIZZA & PARTY', C.hi);
    ui.text(29, 3, '★', C.yel);
    ui.text(3, 4, `夜间安保终端 · ${game.nightName(game.night)}`, C.cy);
    ui.text(3, 5, '班次 00:00 — 06:00    右键 / ESC 离开终端', C.dim);
    ui.bigText(57, 3, w.clock(), w.overtime ? C.red : C.hi);
    ui.text(76, 3, w.overtime && !w.clockStuck ? 'OT' : 'AM', w.clockStuck ? C.red : C.cy);
    ui.text(76, 5, Math.floor(term.time * 2) % 2 ? '●' : ' ', C.red);
    ui.hline(1, 6, COLS - 2, '─', C.dim2);

    for (const t of TILES) {
      const wd = 36;
      const h = 7;
      const hov = ui.hit('tile-' + t.key, t.x, t.y, wd, h, () => term.go(t.key));
      const bg = hov ? C.bg3 : C.bg;
      ui.box(t.x, t.y, wd, h, { style: hov ? 'double' : 'single', fg: hov ? C.hi : C.fg, bg, shadow: true });
      ui.art(t.x + 2, t.y + 1, ICONS[t.key], hov ? C.yel : C.cy, bg);
      ui.text(t.x + 14, t.y + 1, t.n, C.ink, hov ? C.yel : C.cy);
      ui.text(t.x + 16, t.y + 1, t.title, C.hi, bg);
      ui.text(t.x + 14, t.y + 2, t.en, C.dim, bg);
      const [a, b] = status(t.key, w);
      ui.text(t.x + 14, t.y + 4, fit(a, 21), C.fg, bg);
      ui.text(t.x + 14, t.y + 5, fit(b, 21), b.includes('!!') ? C.red : C.dim, bg);
      if (hov) ui.text(t.x + wd - 4, t.y + 1, '►', C.yel, bg);
    }

    ui.box(2, 23, 76, 6, { title: '系统日志 SYSLOG', titleAlign: 'left', fg: C.dim, titleFg: C.fg });
    w.logLines.slice(-4).forEach((l, i) => {
      const col = l.level === 'warn' ? C.yel : l.level === 'err' ? C.red : l.level === 'dim' ? C.dim : C.fg;
      ui.text(4, 24 + i, l.t, C.dim);
      ui.text(11, 24 + i, fit(l.msg, 64), col);
    });
  },
};
