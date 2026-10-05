import { C, fit, strWidth } from '../screen.js';
import { state, log, emit, powered } from '../../state.js';
import { ROOMS, DOORS } from '../../rooms.js';

let selected = '02';
const SCAN_TIME = 1.8;

function rs(id) {
  if (!state.rooms[id]) {
    state.rooms[id] = {
      sealed: false,
      light: false,
      noise: 25 + Math.random() * 10,
      hist: [],
      scan: 0,          // >0 while scanning
      result: null,
      temp: 19 + Math.random() * 3,
    };
  }
  return state.rooms[id];
}

const SPARK = '▁▂▃▄▅▆▇█';

// random-ish but plausible scan outcomes. nothing is in the building... yet
function scanResult(id) {
  const r = Math.random();
  if (id === '01') return r < 0.5 ? ['3 个静止热源', C.fg] : ['3 个静止热源 · 姿态正常', C.fg];
  if (r < 0.07) return ['微弱运动 · 可能为误报', C.yel];
  if (r < 0.12) return ['传感器回波异常', C.yel];
  return ['未检测到运动', C.dim];
}

export const mapPage = {
  path: 'C:\\SEC\\MAP>',

  init() {
    for (const r of ROOMS) rs(r.id);
  },

  tick(term, dt) {
    for (const r of ROOMS) {
      const s = rs(r.id);
      s.noise += (28 + (s.spike || 0) - s.noise) * dt * 0.8 + (Math.random() - 0.5) * 6 * dt;
      if (s.spike) s.spike = Math.max(0, s.spike - dt * 8);
      s.acc = (s.acc || 0) + dt;
      if (s.acc > 0.4) {
        s.acc = 0;
        s.hist.push(s.noise);
        if (s.hist.length > 12) s.hist.shift();
      }
      if (s.scan > 0) {
        s.scan -= dt;
        if (Math.floor(s.scan * 6) !== Math.floor((s.scan + dt) * 6)) term.sfx.blip(900 + (1 - s.scan / SCAN_TIME) * 600);
        if (s.scan <= 0) {
          s.result = scanResult(r.id);
          s.scan = 0;
          term.sfx.ok();
          log(`扫描 ${r.id} ${r.name}: ${s.result[0]}`, s.result[1] === C.yel ? 'warn' : 'info');
        }
      }
    }
  },

  draw(term, ui) {
    const net = powered('C6');
    ui.box(1, 2, 54, 27, { title: '设施平面图 FLOOR PLAN · 1F', titleAlign: 'left', fg: C.dim, titleFg: C.fg });

    for (const d of DOORS) {
      if (d.office) {
        const lit = d.office !== 'B' && state.doorLight[d.office];
        const ch = d.office === 'B' ? (state.backLock ? '■' : '░') : lit ? '☼' : '▒';
        ui.text(d.x, d.y, ch, lit ? C.yel : d.office === 'B' ? C.red : C.cy);
      } else ui.text(d.x, d.y, d.ch, C.dim);
    }

    for (const r of ROOMS) {
      const s = rs(r.id);
      const isOffice = r.id === 'OF';
      const sel = selected === r.id;
      const hov = ui.hit('room-' + r.id, r.x, r.y, r.w, r.h, () => {
        selected = r.id;
        term.sfx.select();
      });
      let fg = isOffice ? C.yel : C.fg;
      if (!net && !isOffice) fg = C.dim2;
      if (sel) fg = C.hi;
      const bg = sel ? C.bg3 : hov ? C.bg2 : C.bg;
      ui.box(r.x, r.y, r.w, r.h, { style: s.sealed ? 'heavy' : sel ? 'double' : 'single', fg, bg });

      // scanning sweep
      if (s.scan > 0) {
        const p = 1 - s.scan / SCAN_TIME;
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
      // status icons bottom-right
      let icons = '';
      if (s.light) icons += '☼';
      if (s.sealed) icons += '▣';
      if (s.noise > 45 && net) icons += '!';
      if (icons) ui.text(r.x + r.w - 1 - strWidth(icons), r.y + r.h - 2, icons, C.yel, bg);
    }

    ui.text(3, 27, '★保安室 ☼门灯/照明 ▣封锁 ■后门锁 !声学异常', C.dim);
    if (!net && Math.floor(term.time * 2) % 2) ui.center(13, ' 传感网络离线 SENSOR NET OFFLINE ', C.ink, C.yel, 1, 54);

    this.drawPanel(term, ui, net);
  },

  drawPanel(term, ui, net) {
    const r = ROOMS.find((x) => x.id === selected);
    const s = rs(r.id);
    const X = 56;
    ui.box(X, 2, 23, 27, { title: `节点 ${r.id}`, style: 'double', titleAlign: 'left' });
    ui.text(X + 2, 3, fit(r.name, 19), C.hi);
    ui.text(X + 2, 4, fit(r.en, 19), C.dim);
    ui.hline(X + 1, 5, 21, '─', C.dim2);

    const row = (y, k, v, col = C.fg) => {
      ui.text(X + 2, y, k, C.dim);
      ui.text(X + 7, y, fit(v, 14), col);
    };
    if (!net) {
      row(6, '状态', '离线', C.red);
    } else {
      row(6, '状态', s.scan > 0 ? '扫描中...' : '在线', s.scan > 0 ? C.yel : C.ok);
      row(7, '声学', `${s.noise.toFixed(0)} dB`, s.noise > 45 ? C.yel : C.fg);
      let sp = '';
      for (const v of s.hist) sp += SPARK[Math.max(0, Math.min(7, Math.floor((v - 20) / 5)))];
      ui.text(X + 14, 7, sp.slice(-7), C.cy);
      row(8, '温度', `${s.temp.toFixed(1)}°C`);
      row(9, '照明', s.light ? '开启' : '关闭', s.light ? C.yel : C.fg);
      row(10, '通道', s.sealed ? '已封锁' : '开放', s.sealed ? C.yel : C.fg);
      ui.text(X + 2, 11, '运动', C.dim);
      if (r.id === 'OF') ui.text(X + 7, 11, '你在这里.', C.yel);
      else if (s.result) ui.text(X + 7, 11, fit(s.result[0], 14), s.result[1]);
      else ui.text(X + 7, 11, '——', C.dim);
    }
    ui.hline(X + 1, 12, 21, '─', C.dim2);

    const isOffice = r.id === 'OF';
    const dis = !net || isOffice;
    let y = 13;
    ui.pushButton('m-scan', X + 2, y, 18, '◉ 运动扫描', () => {
      s.scan = SCAN_TIME;
      s.result = null;
    }, { disabled: dis || s.scan > 0 });
    y += 3;
    ui.pushButton('m-lure', X + 2, y, 18, '♪ 声音诱饵', () => {
      s.spike = 40;
      log(`声音诱饵已在 ${r.id} ${r.name} 播放.`);
      emit('lure', r);
    }, { disabled: dis || !powered('C7') });
    y += 3;
    ui.pushButton('m-light', X + 2, y, 18, s.light ? '☼ 关闭照明' : '☼ 区域照明', () => {
      s.light = !s.light;
      s.light ? term.sfx.on() : term.sfx.off();
      log(`${r.id} ${r.name} 照明${s.light ? '开启' : '关闭'}.`);
    }, { disabled: dis, active: s.light });
    y += 3;
    ui.pushButton('m-seal', X + 2, y, 18, s.sealed ? '▣ 解除封锁' : '▣ 封锁通道', () => {
      s.sealed = !s.sealed;
      s.sealed ? term.sfx.on() : term.sfx.off();
      log(`${r.id} ${r.name} 通道${s.sealed ? '已封锁' : '已解除封锁'}.`, s.sealed ? 'warn' : 'info');
    }, { disabled: dis, active: s.sealed });
    y += 3;
    ui.hline(X + 1, y, 21, '─', C.dim2);
    ui.pushButton('m-all', X + 2, y + 1, 18, '全域扫描', () => {
      let k = 0;
      for (const rr of ROOMS) {
        if (rr.id === 'OF') continue;
        const ss = rs(rr.id);
        ss.scan = SCAN_TIME + k * 0.15;
        ss.result = null;
        k++;
      }
      log('全域运动扫描开始...');
    }, { disabled: !net });
  },
};

export function roomState(id) {
  return rs(id);
}
