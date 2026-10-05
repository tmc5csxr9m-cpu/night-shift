import { C, fit } from '../screen.js';
import { state, currentLoad, log, emit } from '../../state.js';

const SPARK = ' ▁▂▃▄▅▆▇█';
const history = [];
let acc = 0;
const gen = { state: 'idle', t: 0, fuel: 0.64 };

// flavour text logged when a circuit changes
const NOTES = {
  C9: ['舞台电路已断开. 表演者切换为内置电池.', '舞台电路已恢复.'],
  C0: ['冷库断电. 后厨温度将逐渐升高.', '冷库供电恢复.'],
  C6: ['传感网络离线. 地图将无法更新.', '传感网络重新上线 (12/12).'],
  C8: ['后门磁锁失去供电!', '后门磁锁供电恢复.'],
};

function maxLoad() {
  return state.circuits.reduce((a, c) => a + c.load, 0.6) + 1.5;
}

export const powerPage = {
  path: 'C:\\SEC\\POWER>',

  tick(term, dt) {
    acc += dt;
    if (acc > 0.5) {
      acc = 0;
      history.push(currentLoad() * (0.97 + Math.random() * 0.06));
      if (history.length > 34) history.shift();
    }
    if (gen.state === 'cranking') {
      gen.t += dt;
      if (Math.floor(gen.t * 4) !== Math.floor((gen.t - dt) * 4)) term.sfx.tick();
      if (gen.t > 2.5) {
        gen.state = 'running';
        term.sfx.ok();
        log('备用发电机已启动 (演示: 不消耗燃料).');
      }
    }
  },

  draw(term, ui) {
    const load = currentLoad();
    // ------------------------------------------------- reserve
    ui.box(2, 3, 36, 8, { title: '主电源储备 RESERVE', titleAlign: 'left' });
    ui.bigText(5, 5, '100%', C.hi);
    ui.text(23, 5, '∞', C.yel);
    ui.text(25, 5, '无限模式', C.yel);
    ui.text(23, 6, 'DEMO BUILD', C.dim);
    ui.text(4, 8, '┌' + '─'.repeat(28) + '┐', C.fg);
    ui.text(4, 9, '│', C.fg);
    ui.bar(5, 9, 28, 1, { fg: C.cy });
    ui.text(33, 9, '│▌', C.fg);

    // ------------------------------------------------- load graph
    ui.box(2, 12, 36, 10, { title: '负载曲线 LOAD/kW', titleAlign: 'left' });
    const top = maxLoad();
    const gh = 6;
    for (let i = 0; i < history.length; i++) {
      const v = (history[i] / top) * gh;
      for (let r = 0; r < gh; r++) {
        const k = Math.max(0, Math.min(1, v - r));
        const ch = SPARK[Math.round(k * 8)];
        ui.s.set(3 + i, 12 + gh - r, ch, i === history.length - 1 ? C.hi : C.cy);
      }
    }
    ui.text(3, 19, '─'.repeat(34), C.dim2);
    ui.text(3, 20, `当前 ${load.toFixed(2)}kW`, C.hi);
    ui.text(20, 20, `峰值 ${top.toFixed(1)}kW`, C.dim);

    // ------------------------------------------------- generator
    ui.box(2, 23, 36, 6, { title: '备用发电机 GENERATOR', titleAlign: 'left' });
    const gs = { idle: ['待机', C.dim], cranking: ['启动中...', C.yel], running: ['运行中', C.ok] }[gen.state];
    ui.text(4, 24, '状态', C.dim);
    ui.text(9, 24, gs[0], gs[1]);
    ui.text(4, 25, '燃料', C.dim);
    ui.bar(9, 25, 14, gen.fuel, { fg: C.yel, blocky: true });
    ui.text(24, 25, `${Math.round(gen.fuel * 100)}%`, C.fg);
    if (gen.state === 'idle') {
      ui.pushButton('gen-start', 26, 26, 9, '启动', () => {
        gen.state = 'cranking';
        gen.t = 0;
        log('正在启动备用发电机...');
      });
    } else if (gen.state === 'running') {
      ui.pushButton('gen-stop', 26, 26, 9, '停机', () => {
        gen.state = 'idle';
        term.sfx.off();
        log('备用发电机已停机.');
      });
    } else {
      ui.text(4, 26, '▒'.repeat(Math.floor((gen.t / 2.5) * 20)), C.yel);
    }

    // ------------------------------------------------- breaker panel
    ui.box(40, 3, 38, 26, { title: '配电盘 BREAKER PANEL', titleAlign: 'left', style: 'double' });
    ui.text(42, 4, '回路  名称          负载      开关', C.dim);
    state.circuits.forEach((c, i) => {
      const y = 5 + i * 2;
      const hov = ui.hit('cb-' + c.id, 41, y, 36, 2, () => {
        c.on = !c.on;
        c.on ? term.sfx.on() : term.sfx.off();
        const note = NOTES[c.id];
        if (note) log(c.on ? note[1] : note[0], c.on ? 'info' : 'warn');
        else log(`${c.id} ${c.name} ${c.on ? '闭合' : '断开'}.`);
        emit('facility');
      });
      const bg = hov ? C.bg3 : undefined;
      if (hov) ui.fill(41, y, 36, 2, C.bg3);
      ui.text(42, y, c.id, c.on ? C.cy : C.dim, bg);
      ui.text(46, y, fit(c.name, 10), c.on ? C.hi : C.dim, bg);
      ui.text(46, y + 1, fit(c.en, 10), C.dim2, bg);
      ui.text(57, y, `${c.load.toFixed(2)}kW`, C.fg, bg);
      ui.segments(57, y + 1, 6, c.on ? Math.ceil((c.load / 2.4) * 6) : 0, C.cy, C.dim2);
      // breaker switch
      if (c.on) ui.text(68, y, '▐ON ▌', C.ink, C.cy);
      else ui.text(68, y, '▐OFF▌', C.dim, C.bg2);
      ui.text(68, y + 1, c.on ? ' ▀▀  ' : '  ▄▄ ', c.on ? C.cy : C.dim2, bg);
    });
    ui.text(42, 25, '─'.repeat(34), C.dim2);
    ui.pushButton('cb-all', 42, 26, 14, '全部闭合', () => {
      state.circuits.forEach((c) => (c.on = true));
      term.sfx.on();
      log('所有回路已闭合.');
      emit('facility');
    });
    ui.text(60, 26, `闭合 ${state.circuits.filter((c) => c.on).length}/10`, C.fg);
  },
};
