import { C, fit } from '../screen.js';
import { CIRCUITS } from '../../sim/index.js';

const SPARK = ' ▁▂▃▄▅▆▇█';
let history = [];
let acc = 0;

const INFO = {
  C1: ['办公室照明', 'OFFICE LT'],
  C2: ['左门灯', 'L-DOOR LT'],
  C3: ['右门灯', 'R-DOOR LT'],
  C4: ['通风系统', 'HVAC'],
  C5: ['桌面风扇', 'DESK FAN'],
  C6: ['传感网络', 'SENSOR NET'],
  C7: ['公共广播', 'PA / MUSIC'],
  C8: ['后门磁锁', 'MAGLOCK'],
  C9: ['舞台电路', 'STAGE'],
  C0: ['后厨冷库', 'FREEZER'],
};

const PART_NAMES = {
  base: '终端/主机', sensors: '传感网', pa: '广播', maglock: '磁锁', stage: '舞台', freezer: '冷库',
  officeLight: '办公室灯', doorL: '左门灯', doorR: '右门灯', vent: '通风', fan: '风扇', roomLights: '区域照明', seals: '卷帘',
};

export const powerPage = {
  path: 'C:\\SEC\\POWER>',

  reset() {
    history = [];
    acc = 0;
  },

  tick(term, dt) {
    acc += dt;
    if (acc > 0.5) {
      acc = 0;
      history.push(term.world.power.load);
      if (history.length > 34) history.shift();
    }
  },

  draw(term, ui) {
    const w = term.world;
    const pw = w.power;
    const pct = w.powerPct();
    // ------------------------------------------------- reserve
    ui.box(2, 3, 36, 8, { title: '用电储备 RESERVE', titleAlign: 'left' });
    const col = pct < 15 ? C.red : pct < 35 ? C.yel : C.hi;
    ui.bigText(5, 5, `${Math.floor(pct)}%`, col);
    const rate = (pw.load / 60) / pw.max * 100; // % per real second
    ui.text(24, 5, `-${rate.toFixed(2)}%/s`, C.fg);
    const eta = rate > 0 ? pct / rate : Infinity;
    ui.text(24, 6, eta === Infinity ? '可用 ∞' : `可用 ${Math.floor(eta / 60)}:${String(Math.floor(eta % 60)).padStart(2, '0')}`, C.dim);
    ui.text(4, 8, '┌' + '─'.repeat(28) + '┐', C.fg);
    ui.text(4, 9, '│', C.fg);
    ui.bar(5, 9, 28, pct / 100, { fg: col === C.hi ? C.cy : col });
    ui.text(33, 9, '│▌', C.fg);

    // ------------------------------------------------- load graph
    ui.box(2, 12, 36, 9, { title: '负载曲线 LOAD/kW', titleAlign: 'left' });
    const top = w.P.power.tripLimit;
    const gh = 5;
    for (let i = 0; i < history.length; i++) {
      const v = (history[i] / top) * gh;
      for (let r = 0; r < gh; r++) {
        const k = Math.max(0, Math.min(1, v - r));
        ui.s.set(3 + i, 12 + gh - r, SPARK[Math.round(k * 8)], i === history.length - 1 ? C.hi : history[i] > top * 0.85 ? C.yel : C.cy);
      }
    }
    ui.text(3, 18, '─'.repeat(34), C.dim2);
    ui.text(3, 19, `当前 ${pw.load.toFixed(2)}kW`, C.hi);
    ui.text(20, 19, `跳闸 ${top.toFixed(1)}kW`, pw.load > top * 0.85 ? C.yel : C.dim);

    // ------------------------------------------------- breakdown
    ui.box(2, 22, 36, 7, { title: '负载分项', titleAlign: 'left' });
    const parts = Object.entries(pw.parts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    parts.forEach(([k, v], i) => {
      const x = 4 + (i % 2) * 17;
      const y = 23 + Math.floor(i / 2);
      ui.text(x, y, fit(PART_NAMES[k] || k, 9), C.dim);
      ui.text(x + 9, y, v.toFixed(2), C.fg);
    });

    // ------------------------------------------------- breaker panel
    ui.box(40, 3, 38, 26, { title: '配电盘 BREAKER PANEL', titleAlign: 'left', style: 'double' });
    if (pw.tripped) {
      const blink = Math.floor(term.time * 3) % 2;
      ui.fill(41, 4, 36, 1, blink ? '#8a0c0c' : C.bg2);
      ui.text(42, 4, pw.blackoutT > 0 ? `主闸跳闸 · 冷却 ${pw.blackoutT.toFixed(1)}s` : '主闸跳闸 · 可以复位', C.hi, blink ? '#8a0c0c' : C.bg2);
    } else ui.text(42, 4, '回路  名称          负载      开关', C.dim);
    CIRCUITS.forEach((id, i) => {
      const y = 5 + i * 2;
      const on = w.circuits[id];
      const [name, en] = INFO[id];
      const hov = ui.hit('cb-' + id, 41, y, 36, 2, () => term.cmd('breaker', { id }, on ? 'off' : 'on'));
      const bg = hov ? C.bg3 : undefined;
      if (hov) ui.fill(41, y, 36, 2, C.bg3);
      ui.text(42, y, id, on ? C.cy : C.dim, bg);
      ui.text(46, y, fit(name, 10), on ? C.hi : C.dim, bg);
      ui.text(46, y + 1, fit(en, 10), C.dim2, bg);
      const load = { C1: 0.42, C2: 0.65, C3: 0.65, C4: 1.08, C5: 0.08, C6: 0.55, C7: 0.3, C8: 0.35, C9: 2.4, C0: 1.3 }[id];
      ui.text(57, y, `${load.toFixed(2)}kW`, C.fg, bg);
      ui.segments(57, y + 1, 6, on ? Math.ceil((load / 2.4) * 6) : 0, C.cy, C.dim2);
      if (on) ui.text(68, y, '▐ON ▌', C.ink, pw.tripped ? C.dim : C.cy);
      else ui.text(68, y, '▐OFF▌', C.dim, C.bg2);
      ui.text(68, y + 1, on ? ' ▀▀  ' : '  ▄▄ ', on ? C.cy : C.dim2, bg);
    });
    ui.text(42, 25, '─'.repeat(34), C.dim2);
    if (pw.tripped) {
      ui.pushButton('reset-main', 42, 26, 16, '■ 主闸复位', () => term.cmd('resetMain', {}, 'on'), { disabled: pw.blackoutT > 0, danger: true, active: true });
    } else {
      ui.pushButton('cb-all', 42, 26, 14, '全部闭合', () => {
        for (const id of CIRCUITS) if (!w.circuits[id]) term.cmd('breaker', { id, on: true });
        term.sfx.on();
      });
    }
    ui.text(61, 26, `闭合 ${CIRCUITS.filter((c) => w.circuits[c]).length}/10`, C.fg);
  },
};
