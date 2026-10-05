import { C, COLS, fit } from '../screen.js';
import { state, clockString, currentLoad } from '../../state.js';

const ICONS = {
  power: [
    '     ▄██▀ ',
    '    ██▀   ',
    '   ██████▀',
    '     ▄█▀  ',
    '    ▄▀    ',
  ],
  map: [
    '┌──┬────┬─┐',
    '│01│ 02 │ │',
    '├──┴─┬──┤ │',
    '│ 03 │★ │ │',
    '└────┴──┴─┘',
  ],
  facility: [
    '  ▄ ▄█▄ ▄ ',
    '  ▀█████▀ ',
    ' ▄██▀ ▀██▄',
    '  ▀██▄██▀ ',
    '  ▀ ▀█▀ ▀ ',
  ],
  tasks: [
    '┌────────┐',
    '│√ ════  │',
    '│√ ═════ │',
    '│▫ ═══   │',
    '└────────┘',
  ],
};

const TILES = [
  { key: 'power', n: '1', title: '电力控制', en: 'POWER  DISTRIBUTION', x: 2, y: 7 },
  { key: 'map', n: '2', title: '设施地图', en: 'FACILITY  MAP', x: 41, y: 7 },
  { key: 'facility', n: '3', title: '设施控制', en: 'SYSTEMS  CONTROL', x: 2, y: 15 },
  { key: 'tasks', n: '4', title: '值班任务', en: 'SHIFT  TASKS', x: 41, y: 15 },
];

function status(key) {
  switch (key) {
    case 'power': {
      const on = state.circuits.filter((c) => c.on).length;
      return [`负载 ${currentLoad().toFixed(2)} kW`, `电路 ${on}/${state.circuits.length} 闭合 · 储备 ∞`];
    }
    case 'map': {
      const n = Object.values(state.rooms).filter((r) => r.sealed).length;
      return ['传感节点 12/12 在线', `封锁区域 ${n} · 扫描就绪`];
    }
    case 'facility': {
      const l = state.doorLight.L ? '亮' : '灭';
      const r = state.doorLight.R ? '亮' : '灭';
      return [`门灯  左:${l}  右:${r}`, `风扇:${state.fan.on ? '运转' : '停止'}  通风:${state.vent}档`];
    }
    case 'tasks': {
      const done = state.tasks.filter((t) => t.done).length;
      return [`进度 ${done}/${state.tasks.length} 已完成`, '截止 06:00 AM'];
    }
  }
  return ['', ''];
}

export const homePage = {
  path: 'C:\\SEC\\MAIN>',

  draw(term, ui) {
    // header
    ui.text(3, 3, '★', C.yel);
    ui.text(5, 3, 'STARLIGHT PIZZA & PARTY', C.hi);
    ui.text(29, 3, '★', C.yel);
    ui.text(3, 4, '星光披萨乐园 · 夜间安保终端', C.cy);
    ui.text(3, 5, '值班员: 新员工 #0451    班次: 00:00 — 06:00', C.dim);

    ui.bigText(57, 3, clockString(), C.hi);
    ui.text(76, 3, 'AM', C.cy);
    ui.text(76, 5, Math.floor(term.time * 2) % 2 ? '●' : ' ', C.red);
    ui.hline(1, 6, COLS - 2, '─', C.dim2);

    for (const t of TILES) {
      const w = 36;
      const h = 7;
      const hov = ui.hit('tile-' + t.key, t.x, t.y, w, h, () => term.go(t.key));
      const bg = hov ? C.bg3 : C.bg;
      ui.box(t.x, t.y, w, h, {
        style: hov ? 'double' : 'single',
        fg: hov ? C.hi : C.fg,
        bg,
        shadow: true,
      });
      ui.art(t.x + 2, t.y + 1, ICONS[t.key], hov ? C.yel : C.cy, bg);
      ui.text(t.x + 14, t.y + 1, `${t.n}`, C.ink, hov ? C.yel : C.cy);
      ui.text(t.x + 16, t.y + 1, t.title, C.hi, bg);
      ui.text(t.x + 14, t.y + 2, t.en, C.dim, bg);
      const [a, b] = status(t.key);
      ui.text(t.x + 14, t.y + 4, fit(a, 21), C.fg, bg);
      ui.text(t.x + 14, t.y + 5, fit(b, 21), C.dim, bg);
      if (hov) ui.text(t.x + w - 4, t.y + 1, '►', C.yel, bg);
    }

    // log panel
    ui.box(2, 23, 76, 6, { title: '系统日志 SYSLOG', titleAlign: 'left', fg: C.dim, titleFg: C.fg });
    const lines = state.log.slice(-4);
    lines.forEach((l, i) => {
      const col = l.level === 'warn' ? C.yel : l.level === 'err' ? C.red : C.fg;
      ui.text(4, 24 + i, `${l.t}`, C.dim);
      ui.text(11, 24 + i, fit(l.msg, 64), col);
    });
  },
};
