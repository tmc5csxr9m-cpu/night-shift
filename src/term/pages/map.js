import { C, fit, strWidth } from '../screen.js';
import { ROOMS, DOORS } from '../../rooms.js';
import { game } from '../../game.js';
import { sensorRoom } from '../../sim/graph.js';

let selected = '02';
// fading acoustic "footprints" per room, purely visual
const heat = {};

const SPARK = '▁▂▃▄▅▆▇█';
const ACTOR_MARK = { sunny: 'S', pip: 'P', tootie: 'T', back: 'B', chef: 'C', ribbon: 'R' };

export const mapPage = {
  path: 'C:\\SEC\\MAP>',

  reset() {
    selected = '02';
    for (const k in heat) delete heat[k];
  },

  tick(term, dt) {
    const w = term.world;
    for (const r of ROOMS) {
      const s = w.rooms[r.id];
      const h = Math.max(0, (s.noise - 34) / 20);
      heat[r.id] = Math.max((heat[r.id] || 0) - dt * 0.05, h);
    }
  },

  draw(term, ui) {
    const w = term.world;
    const net = w.powered('C6');
    ui.box(1, 2, 54, 27, { title: '设施平面图 FLOOR PLAN · 1F', titleAlign: 'left', fg: C.dim, titleFg: C.fg });

    for (const d of DOORS) {
      if (d.office) {
        const lit = d.office !== 'B' && w.doorLit(d.office);
        const ch = d.office === 'B' ? (w.office.maglock ? '■' : '░') : lit ? '☼' : '▒';
        ui.text(d.x, d.y, ch, lit ? C.yel : d.office === 'B' ? C.red : C.cy);
      } else ui.text(d.x, d.y, d.ch, C.dim);
    }

    // debug: where everything really is
    const marks = {};
    if (game.debug) for (const a of w.actors) {
      const room = sensorRoom(a.node) || 'BACKP';
      (marks[room] = marks[room] || []).push(ACTOR_MARK[a.id] + (a.node.endsWith('N') ? '近' : a.node.startsWith('DOOR') ? '门' : ''));
    }

    for (const r of ROOMS) {
      const s = w.rooms[r.id];
      const isOffice = r.id === 'OF';
      const sel = selected === r.id;
      const hov = ui.hit('room-' + r.id, r.x, r.y, r.w, r.h, () => {
        selected = r.id;
        term.sfx.select();
      });
      let fg = isOffice ? C.yel : C.fg;
      if (!net && !isOffice) fg = C.dim2;
      if (sel) fg = C.hi;
      let bg = sel ? C.bg3 : hov ? C.bg2 : C.bg;
      // acoustic footprint tint
      const hh = net && !isOffice ? heat[r.id] || 0 : 0;
      if (!sel && !hov && hh > 0.15) bg = hh > 0.6 ? '#2a2a9a' : '#18208f';
      ui.box(r.x, r.y, r.w, r.h, { style: s.sealed ? 'heavy' : sel ? 'double' : 'single', fg: s.sealed ? C.yel : fg, bg });
      if (!net && !isOffice) {
        for (let j = 1; j < r.h - 1; j++) for (let i = 1; i < r.w - 1; i++) if (Math.random() < 0.3) ui.s.set(r.x + i, r.y + j, '░▒'[(Math.random() * 2) | 0], C.dim2, bg);
      }
      if (s.scanT > 0) {
        const p = 1 - s.scanT / w.P.scan.time;
        const col = Math.floor(p * (r.w - 2));
        for (let j = 1; j < r.h - 1; j++) {
          for (let i = 1; i < r.w - 1; i++) {
            const d = col - (i - 1);
            if (d === 0) ui.s.set(r.x + i, r.y + j, '▌', C.hi, bg);
            else if (d > 0 && d < 4) ui.s.set(r.x + i, r.y + j, '░▒▓'[3 - d] || '░', C.cy, bg);
          }
        }
      }
      const inner = r.w - 2;
      if (isOffice) {
        ui.text(r.x + 1, r.y + 1, fit(' ★YOU', inner), C.yel, bg);
        ui.text(r.x + 1, r.y + 2, fit(r.name, inner, 'center'), C.hi, bg);
      } else if (inner >= 10) {
        ui.text(r.x + 1, r.y + 1, r.id, net ? C.cy : C.dim2, bg);
        ui.text(r.x + 4, r.y + 1, fit(r.name, inner - 3), fg, bg);
        if (r.h > 3) ui.text(r.x + 1, r.y + 2, fit(r.en, inner), C.dim, bg);
      } else {
        ui.text(r.x + 1, r.y + 1, r.id, net ? C.cy : C.dim2, bg);
        ui.text(r.x + 1, r.y + 2, fit(r.name, inner), fg, bg);
      }
      let icons = '';
      if (s.light) icons += '☼';
      if (s.sealed) icons += '▣';
      if (s.noise > 42 && net) icons += '!';
      if (icons) ui.text(r.x + r.w - 1 - strWidth(icons), r.y + r.h - 2, icons, C.yel, bg);
      if (marks[r.id]) ui.text(r.x + 1, r.y + r.h - 2, fit(marks[r.id].join(' '), r.w - 2 - strWidth(icons)), '#ff70ff', bg);
    }
    if (marks.BACKP) ui.text(16, 26, marks.BACKP.join(' '), '#ff70ff');

    ui.text(3, 27, '★保安室 ☼照明 ▣封锁 ■后门锁 !声学异常', C.dim);
    if (!net && Math.floor(term.time * 2) % 2) ui.center(13, ' 传感网络离线 SENSOR NET OFFLINE ', C.ink, C.yel, 1, 54);
    this.drawPanel(term, ui, net);
  },

  drawPanel(term, ui, net) {
    const w = term.world;
    const r = ROOMS.find((x) => x.id === selected);
    const s = w.rooms[r.id];
    const X = 56;
    ui.box(X, 2, 23, 27, { title: `节点 ${r.id}`, style: 'double', titleAlign: 'left' });
    ui.text(X + 2, 3, fit(r.name, 19), C.hi);
    ui.text(X + 2, 4, fit(r.en, 19), C.dim);
    ui.hline(X + 1, 5, 21, '─', C.dim2);
    const row = (y, k, v, col = C.fg) => {
      ui.text(X + 2, y, k, C.dim);
      ui.text(X + 7, y, fit(v, 14), col);
    };
    const isOffice = r.id === 'OF';
    if (!net) row(6, '状态', '离线', C.red);
    else {
      row(6, '状态', s.scanT > 0 ? '扫描中...' : '在线', s.scanT > 0 ? C.yel : C.ok);
      row(7, '声学', `${s.noise.toFixed(0)} dB`, s.noise > 42 ? C.yel : C.fg);
      let sp = '';
      for (const v of s.hist) sp += SPARK[Math.max(0, Math.min(7, Math.floor((v - 22) / 4)))];
      ui.text(X + 14, 7, sp.slice(-7), C.cy);
      row(8, '照明', s.light ? '开启 0.3kW' : '关闭', s.light ? C.yel : C.fg);
      const other = Object.entries(w.rooms).find(([id, x]) => x.sealed && id !== r.id);
      row(9, '卷帘', s.sealed ? `落下 ${s.sealT.toFixed(0)}s` : other ? `泵忙(${other[0]})` : w.shutterCd > 0 ? `复位 ${w.shutterCd.toFixed(0)}s` : '升起', s.sealed ? C.yel : C.fg);
      ui.text(X + 2, 10, '扫描', C.dim);
      if (isOffice) ui.text(X + 7, 10, '你在这里.', C.yel);
      else if (s.result) ui.text(X + 7, 10, fit(s.result.text, 14), s.result.count ? C.yel : C.dim);
      else ui.text(X + 7, 10, '——', C.dim);
    }
    ui.hline(X + 1, 12, 21, '─', C.dim2);
    const dis = !net || isOffice;
    let y = 13;
    const scanLabel = s.scanCd > 0 ? `◉ 冷却 ${s.scanCd.toFixed(0)}s` : '◉ 运动扫描';
    ui.pushButton('m-scan', X + 2, y, 18, scanLabel, () => term.cmd('scan', { room: r.id }, 'blip'), { disabled: dis || s.scanT > 0 || s.scanCd > 0 });
    y += 3;
    const lureOk = w.calibrated.lure && w.powered('C7');
    ui.pushButton('m-lure', X + 2, y, 18, lureOk ? '♪ 声音诱饵' : '♪ 诱饵 (故障)', () => term.cmd('lure', { room: r.id }, 'ok'), { disabled: isOffice || w.lureCooldown > 0 });
    y += 3;
    ui.pushButton('m-light', X + 2, y, 18, s.light ? '☼ 关闭照明' : '☼ 区域照明', () => term.cmd('roomLight', { room: r.id }, s.light ? 'off' : 'on'), { disabled: isOffice, active: s.light });
    y += 3;
    ui.pushButton('m-seal', X + 2, y, 18, s.sealed ? '▣ 升起卷帘' : '▣ 落下卷帘', () => term.cmd('seal', { room: r.id }, s.sealed ? 'off' : 'on'), { disabled: dis || (!s.sealed && (w.shutterCd > 0 || Object.values(w.rooms).some((x) => x.sealed))), active: s.sealed });
    y += 3;
    ui.hline(X + 1, y, 21, '─', C.dim2);
    ui.text(X + 2, y + 1, `扫描 ${w.stats.scans}  诱饵 ${w.stats.lures}`, C.dim);
    ui.text(X + 2, y + 2, w.calibrated.sensors ? '传感器: 已校准' : '传感器: 未校准', w.calibrated.sensors ? C.ok : C.yel);
  },
};
