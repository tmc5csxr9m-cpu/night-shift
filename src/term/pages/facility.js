import { C, fit } from '../screen.js';
import { game } from '../../game.js';

const W = 18;
const H = 12;
const COLX = [2, 21, 40, 59];
const ROWY = [3, 16];
let bulbHold = { L: 0, R: 0 };
const BULB_TIME = 4;

function card(ui, x, y, title, en, opts = {}) {
  const hov = ui.inside(x, y, W, H);
  const bg = opts.alert ? '#3a0a3a' : hov ? C.bg3 : C.bg;
  ui.box(x, y, W, H, {
    style: hov ? 'double' : 'single',
    fg: opts.unpowered ? C.dim2 : opts.alert ? C.red : hov ? C.hi : C.fg,
    bg,
    shadow: true,
    title,
    titleFg: opts.unpowered ? C.dim : C.hi,
  });
  ui.text(x + 1, y + 4, fit(en, W - 2, 'center'), C.dim, bg);
  if (opts.unpowered) {
    ui.text(x + 1, y + 6, fit('× 无供电', W - 2, 'center'), C.red, bg);
    ui.text(x + 1, y + 7, fit(`检查回路 ${opts.circuit}`, W - 2, 'center'), C.dim, bg);
  }
  return bg;
}

function icon(ui, x, y, lines, fg, bg) {
  lines.forEach((l, i) => ui.text(x + Math.floor((W - l.length) / 2), y + 1 + i, l, fg, bg));
}

function doorCard(term, ui, side, x, y) {
  const w = term.world;
  const d = w.doors[side];
  const cid = side === 'L' ? 'C2' : 'C3';
  const pw = w.powered(cid);
  const lit = w.doorLit(side);
  const bg = card(ui, x, y, side === 'L' ? '左门灯' : '右门灯', side === 'L' ? 'WEST DOOR LIGHT' : 'EAST DOOR LIGHT', {
    unpowered: !pw && !d.broken, circuit: cid, alert: d.broken,
  });
  const hot = d.heat > w.P.doorLight.warn;
  const flick = lit && hot && Math.random() < 0.25;
  icon(ui, x, y, d.broken ? [' ╲ ╱ ', '─(×)─', ' ╱ ╲ '] : lit && !flick ? ['\\ │ /', '─(☼)─', '/ │ \\'] : ['  ·  ', ' (○) ', '  ·  '], d.broken ? C.red : lit ? (hot ? '#ffb050' : C.yel) : C.dim, bg);
  if (!pw && !d.broken) return;
  ui.text(x + 2, y + 5, '灯管', C.dim, bg);
  ui.bar(x + 7, y + 5, 9, d.heat / 100, { fg: d.heat > 75 ? C.red : d.heat > 50 ? C.yel : C.cy });
  ui.text(x + 2, y + 6, d.broken ? '已烧坏' : d.stuckT > 0 ? '继电器卡死' : lit ? '照明中' : '熄灭', d.broken || d.stuckT > 0 ? C.red : lit ? C.yel : C.fg, bg);
  ui.text(x + 11, y + 6, `备件${w.spares}`, w.spares ? C.dim : C.red, bg);
  if (d.broken) {
    const can = w.spares > 0;
    const p = bulbHold[side] / BULB_TIME;
    const hov = ui.pushButton('bulb-' + side, x + 2, y + 8, 13, can ? (p > 0 ? `更换中 ${Math.round(p * 100)}%` : '更换灯管(按住)') : '无备件', null, {
      disabled: !can,
      danger: true,
      onHold: (dt) => {
        bulbHold[side] += dt;
        if (Math.floor(bulbHold[side] * 3) !== Math.floor((bulbHold[side] - dt) * 3)) term.sfx.tick();
        if (bulbHold[side] >= BULB_TIME) {
          bulbHold[side] = 0;
          term.cmd('replaceBulb', { side }, 'ok');
        }
      },
    });
    if (!(hov && ui.down)) bulbHold[side] = Math.max(0, bulbHold[side] - 0.02);
    if (p > 0) ui.bar(x + 2, y + 10, 14, p, { fg: C.yel });
    return;
  }
  ui.pushButton('dl-' + side, x + 2, y + 8, 13, lit ? '■ 关闭' : '□ 开启', () => {
    const r = game.cmd('doorLight', { side });
    if (r.ok === false) {
      term.sfx.error();
      term.toast(r.msg || '无法开启', 'err');
    } else (w.doors[side].on ? term.sfx.on() : term.sfx.off());
  }, { active: lit });
}

export const facilityPage = {
  path: 'C:\\SEC\\SYSCTL>',

  reset() {
    bulbHold = { L: 0, R: 0 };
  },

  draw(term, ui) {
    const w = term.world;
    doorCard(term, ui, 'L', COLX[0], ROWY[0]);
    doorCard(term, ui, 'R', COLX[1], ROWY[0]);

    // ---------------------------------------------------- office light
    {
      const x = COLX[2];
      const y = ROWY[0];
      const pw = w.powered('C1');
      const bg = card(ui, x, y, '办公室照明', 'OFFICE LIGHTING', { unpowered: !pw, circuit: 'C1' });
      const lv = pw ? w.office.light : 0;
      icon(ui, x, y, ['──┬──', ' ▄█▄ ', lv === 2 ? '╱ ▀ ╲' : lv === 1 ? '  ▀  ' : '  ·  '], [C.dim, C.fg, C.yel][lv], bg);
      if (pw) {
        ui.text(x + 2, y + 5, '亮度', C.dim, bg);
        ui.segments(x + 7, y + 5, 6, lv * 3, C.yel);
        ui.text(x + 2, y + 6, `${w.P.power.officeLight[lv].toFixed(2)}kW`, C.dim, bg);
        ['关', '暗', '亮'].forEach((l, i) => {
          ui.pushButton('ol-' + i, x + 2 + i * 5, y + 8, 3, l, () => term.cmd('officeLight', { level: i }, i ? 'on' : 'off'), { active: w.office.light === i });
        });
      }
    }

    // ---------------------------------------------------- desk fan
    {
      const x = COLX[3];
      const y = ROWY[0];
      const pw = w.powered('C5');
      const bg = card(ui, x, y, '桌面风扇', 'DESK FAN', { unpowered: !pw, circuit: 'C5' });
      const run = pw && w.office.fan;
      const f = run ? Math.floor(term.time * 12) % 4 : 0;
      const blade = ['│', '╱', '─', '╲'][f];
      const blade2 = ['─', '╲', '│', '╱'][f];
      icon(ui, x, y, [` ${blade} `, `${blade2}●${blade2}`, ` ${blade} `], run ? C.cy : C.dim, bg);
      if (pw) {
        ui.text(x + 2, y + 5, run ? '运转 +8dB' : '停止', run ? C.cy : C.fg, bg);
        ui.toggle('fan-osc', x + 2, y + 6, w.office.oscillate, '摆头', () => term.cmd('oscillate', {}, 'select'));
        ui.pushButton('fan', x + 2, y + 8, 13, run ? '■ 停止' : '□ 启动', () => term.cmd('fan', {}, run ? 'off' : 'on'), { active: run });
      }
    }

    // ---------------------------------------------------- HVAC
    {
      const x = COLX[0];
      const y = ROWY[1];
      const pw = w.powered('C4');
      const bg = card(ui, x, y, '通风系统', 'VENTILATION', { unpowered: !pw, circuit: 'C4' });
      const sp = pw ? w.office.vent : 0;
      const ph = Math.floor(term.time * (2 + sp * 3));
      const wave = sp ? '≈∼~∼'.repeat(4).slice(ph % 4, (ph % 4) + 5) : '─────';
      icon(ui, x, y, ['╔═════╗', '║' + wave + '║', '╚═════╝'], sp ? C.cy : C.dim, bg);
      if (pw) {
        ui.text(x + 2, y + 5, '风速', C.dim, bg);
        ui.segments(x + 7, y + 5, 6, sp * 2, C.cy);
        ui.text(x + 2, y + 6, `${sp}档 ${(sp * w.P.power.vent).toFixed(2)}kW`, C.fg, bg);
        ui.pushButton('vent-', x + 2, y + 8, 5, '－', () => (w.office.vent > 0 ? term.cmd('vent', { level: w.office.vent - 1 }, 'off') : term.sfx.error()));
        ui.pushButton('vent+', x + 9, y + 8, 5, '＋', () => (w.office.vent < 3 ? term.cmd('vent', { level: w.office.vent + 1 }, 'on') : term.sfx.error()));
      }
    }

    // ---------------------------------------------------- music box
    {
      const x = COLX[1];
      const y = ROWY[1];
      const pw = w.powered('C7');
      const mb = w.musicBox;
      const play = w.musicPlaying();
      const low = mb.wind < 0.25;
      const bg = card(ui, x, y, '音乐盒', 'MUSIC BOX / PA', { unpowered: !pw, circuit: 'C7', alert: !play });
      const note = play && Math.floor(term.time * 2) % 2 ? '♪' : ' ';
      icon(ui, x, y, [`┌───┐${note}`, '│≡≡≡│ ', '└─┬─┘ '], play ? C.cy : C.red, bg);
      if (pw) {
        ui.text(x + 2, y + 5, '发条', C.dim, bg);
        ui.bar(x + 7, y + 5, 9, mb.wind, { fg: low ? C.red : C.cy });
        if (mb.auto) {
          ui.text(x + 2, y + 6, '自动上发条', C.ok, bg);
          ui.text(x + 2, y + 8, fit('别断开 C7!', W - 3), C.dim, bg);
        } else {
          ui.text(x + 2, y + 6, play ? `${Math.round(mb.wind * 100)}% 播放中` : '已停止!', play ? C.fg : C.red, bg);
          // the box itself is on the shelf in front of you: leave the terminal
          ui.text(x + 2, y + 8, fit('离开终端,', W - 3), C.dim, bg);
          ui.text(x + 2, y + 9, fit('按住架子上的盒子', W - 3), low ? C.yel : C.dim, bg);
        }
      }
    }

    // ---------------------------------------------------- back door
    {
      const x = COLX[2];
      const y = ROWY[1];
      const pw = w.powered('C8');
      const o = w.office;
      const bg = card(ui, x, y, '后门磁锁', 'BACK DOOR / 12', { alert: o.coilLockout > 0 });
      const locked = o.maglock;
      icon(ui, x, y, ['▐▀▀▀▌', locked ? '▐ ■ ▌' : '▐ ░ ▌', '▐▄▄▄▌'], locked ? C.cy : C.dim, bg);
      ui.text(x + 2, y + 5, '线圈', C.dim, bg);
      ui.bar(x + 7, y + 5, 9, o.coil / w.P.maglock.maxLock, { fg: o.coil / w.P.maglock.maxLock > 0.7 ? C.red : C.cy });
      ui.text(x + 2, y + 6, !pw ? '无供电' : o.coilLockout > 0 ? `过热 ${o.coilLockout.toFixed(0)}s` : locked ? '锁定' : '未锁', locked ? C.cy : o.coilLockout > 0 ? C.red : C.fg, bg);
      ui.text(x + 11, y + 6, `${w.rooms['12'].noise.toFixed(0)}dB`, w.rooms['12'].noise > 45 ? C.yel : C.dim, bg);
      ui.pushButton('backlock', x + 2, y + 8, 13, locked ? '■ 解锁' : '□ 上锁', () => term.cmd('maglock', {}, locked ? 'off' : 'on'), { disabled: !pw || o.coilLockout > 0, active: locked });
    }

    // ---------------------------------------------------- environment
    {
      const x = COLX[3];
      const y = ROWY[1];
      const t = w.temp;
      const hot = t.eff >= w.P.temp.fault;
      const bg = card(ui, x, y, '环境', 'TEMP / NOISE', { alert: hot });
      ui.text(x + 2, y + 1, fit(`室温 ${t.room.toFixed(1)}°C`, 15), hot ? C.red : C.hi, bg);
      ui.text(x + 2, y + 2, fit(`有效 ${t.eff.toFixed(1)}°C`, 15), hot ? C.red : C.fg, bg);
      ui.bar(x + 2, y + 3, 14, (t.eff - 20) / 18, { fg: hot ? C.red : t.eff > 30 ? C.yel : C.cy, blocky: true });
      ui.text(x + 2, y + 5, fit(`室外 ${t.out.toFixed(1)}°C`, 15), C.dim, bg);
      ui.text(x + 2, y + 6, '噪音', C.dim, bg);
      ui.bar(x + 7, y + 6, 9, (w.noise.db - 30) / 18, { fg: w.noise.db > 38 ? C.yel : C.cy });
      ui.text(x + 2, y + 7, fit(`${w.noise.db.toFixed(0)}dB`, 5), C.fg, bg);
      const parts = Object.keys(w.noise.parts).filter((k) => k !== 'base');
      const names = { fan: '扇', vent: '风', phone: '铃', degauss: '磁', musicBox: '乐', generator: '机' };
      const srcs = parts.map((k) => names[k] || '?');
      ui.text(x + 8, y + 7, fit(srcs.length > 4 ? srcs.slice(0, 3).join('') + '+' : srcs.join(''), 8), C.dim, bg);
      ui.text(x + 2, y + 9, fit(hot ? '!! 终端过热 !!' : '32°C+ 终端出错', 15), hot ? C.red : C.dim2, bg);
    }
  },
};
