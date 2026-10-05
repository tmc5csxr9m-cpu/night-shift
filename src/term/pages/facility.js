import { C, fit } from '../screen.js';
import { state, log, emit, powered } from '../../state.js';
import { roomState } from './map.js';

const W = 18;
const H = 12;
const COLX = [2, 21, 40, 59];
const ROWY = [3, 16];

function changed() {
  emit('facility');
}

function card(ui, x, y, title, en, opts = {}) {
  const hov = ui.inside(x, y, W, H);
  const bg = hov ? C.bg3 : C.bg;
  ui.box(x, y, W, H, {
    style: hov ? 'double' : 'single',
    fg: opts.unpowered ? C.dim2 : hov ? C.hi : C.fg,
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
  const cid = side === 'L' ? 'C2' : 'C3';
  const pw = powered(cid);
  const on = state.doorLight[side] && pw;
  const bg = card(ui, x, y, side === 'L' ? '左门灯' : '右门灯', side === 'L' ? 'WEST DOOR LIGHT' : 'EAST DOOR LIGHT', {
    unpowered: !pw,
    circuit: cid,
  });
  const flick = on && Math.random() < 0.04;
  icon(ui, x, y, on && !flick ? ['\\ │ /', '─(☼)─', '/ │ \\'] : ['  ·  ', ' (○) ', '  ·  '], on ? C.yel : C.dim, bg);
  if (!pw) return;
  ui.text(x + 2, y + 5, '状态', C.dim, bg);
  ui.text(x + 7, y + 5, on ? '照明中' : '熄灭', on ? C.yel : C.fg, bg);
  ui.text(x + 2, y + 6, 'COM1:' + (side === 'L' ? '04' : '05'), C.dim2, bg);
  ui.text(x + 11, y + 6, on ? '0.65kW' : '0.00kW', C.dim, bg);
  ui.pushButton('dl-' + side, x + 2, y + 8, 13, on ? '■ 关闭' : '□ 开启', () => {
    state.doorLight[side] = !state.doorLight[side];
    state.doorLight[side] ? term.sfx.on() : term.sfx.off();
    log(`${side === 'L' ? '左' : '右'}门灯${state.doorLight[side] ? '开启' : '关闭'}.`);
    changed();
  }, { active: on });
}

export const facilityPage = {
  path: 'C:\\SEC\\SYSCTL>',

  draw(term, ui) {
    doorCard(term, ui, 'L', COLX[0], ROWY[0]);
    doorCard(term, ui, 'R', COLX[1], ROWY[0]);

    // ---------------------------------------------------- office light
    {
      const x = COLX[2];
      const y = ROWY[0];
      const pw = powered('C1');
      const bg = card(ui, x, y, '办公室照明', 'OFFICE LIGHTING', { unpowered: !pw, circuit: 'C1' });
      const lv = pw ? state.officeLight : 0;
      icon(ui, x, y, ['──┬──', ' ▄█▄ ', lv === 2 ? '╱ ▀ ╲' : lv === 1 ? '  ▀  ' : '  ·  '], [C.dim, C.fg, C.yel][lv], bg);
      if (pw) {
        ui.text(x + 2, y + 5, '亮度', C.dim, bg);
        ui.segments(x + 7, y + 5, 6, lv * 3, C.yel);
        const lvls = ['关', '暗', '亮'];
        lvls.forEach((l, i) => {
          ui.pushButton('ol-' + i, x + 2 + i * 5, y + 8, 3, l, () => {
            state.officeLight = i;
            i ? term.sfx.on() : term.sfx.off();
            log(`办公室照明: ${['关闭', '调暗', '正常'][i]}.`);
            changed();
          }, { active: state.officeLight === i });
        });
      }
    }

    // ---------------------------------------------------- desk fan
    {
      const x = COLX[3];
      const y = ROWY[0];
      const pw = powered('C5');
      const bg = card(ui, x, y, '桌面风扇', 'DESK FAN', { unpowered: !pw, circuit: 'C5' });
      const run = pw && state.fan.on;
      const f = run ? Math.floor(term.time * 12) % 4 : 0;
      const blade = ['│', '╱', '─', '╲'][f];
      const blade2 = ['─', '╲', '│', '╱'][f];
      icon(ui, x, y, [` ${blade} `, `${blade2}●${blade2}`, ` ${blade} `], run ? C.cy : C.dim, bg);
      if (pw) {
        ui.text(x + 2, y + 5, '状态', C.dim, bg);
        ui.text(x + 7, y + 5, run ? '运转' : '停止', run ? C.cy : C.fg, bg);
        ui.toggle('fan-osc', x + 2, y + 6, state.fan.oscillate, '摆头', () => {
          state.fan.oscillate = !state.fan.oscillate;
          term.sfx.select();
          changed();
        });
        ui.pushButton('fan', x + 2, y + 8, 13, run ? '■ 停止' : '□ 启动', () => {
          state.fan.on = !state.fan.on;
          state.fan.on ? term.sfx.on() : term.sfx.off();
          log(`桌面风扇${state.fan.on ? '启动' : '停止'}.`);
          changed();
        }, { active: run });
      }
    }

    // ---------------------------------------------------- HVAC
    {
      const x = COLX[0];
      const y = ROWY[1];
      const pw = powered('C4');
      const bg = card(ui, x, y, '通风系统', 'VENTILATION', { unpowered: !pw, circuit: 'C4' });
      const sp = pw ? state.vent : 0;
      const ph = Math.floor(term.time * (2 + sp * 3));
      const wave = (o) => (sp ? '≈∼~∼'.repeat(4).slice((ph + o) % 4, ((ph + o) % 4) + 7) : '───────');
      icon(ui, x, y, ['╔═════╗', '║' + wave(0).slice(0, 5) + '║', '╚═════╝'], sp ? C.cy : C.dim, bg);
      if (pw) {
        ui.text(x + 2, y + 5, '风速', C.dim, bg);
        ui.segments(x + 7, y + 5, 6, sp * 2, C.cy);
        ui.text(x + 2, y + 6, `${sp}档  ${(sp * 0.36).toFixed(2)}kW`, C.fg, bg);
        ui.pushButton('vent-', x + 2, y + 8, 5, '－', () => {
          if (state.vent > 0) {
            state.vent--;
            term.sfx.off();
            changed();
          } else term.sfx.error();
        });
        ui.pushButton('vent+', x + 9, y + 8, 5, '＋', () => {
          if (state.vent < 3) {
            state.vent++;
            term.sfx.on();
            changed();
          } else term.sfx.error();
        });
      }
    }

    // ---------------------------------------------------- music box
    {
      const x = COLX[1];
      const y = ROWY[1];
      const pw = powered('C7');
      const bg = card(ui, x, y, '音乐盒广播', 'MUSIC BOX / PA', { unpowered: !pw, circuit: 'C7' });
      const mb = state.musicBox;
      const play = pw && mb.playing && mb.wind > 0;
      const note = play && Math.floor(term.time * 2) % 2 ? '♪' : ' ';
      icon(ui, x, y, [`┌───┐${note}`, '│≡≡≡│ ', '└─┬─┘ '], play ? C.cy : C.dim, bg);
      if (pw) {
        ui.text(x + 2, y + 5, '发条', C.dim, bg);
        ui.bar(x + 7, y + 5, 8, mb.wind, { fg: mb.wind < 0.25 ? C.yel : C.cy });
        ui.toggle('mb-play', x + 2, y + 6, mb.playing, '播放', () => {
          mb.playing = !mb.playing;
          term.sfx.select();
          changed();
        });
        const hov = ui.pushButton('mb-wind', x + 2, y + 8, 13, '↻上发条(按住)', null, {
          onHold: (dt) => {
            mb.wind = Math.min(1, mb.wind + dt * 0.25);
            mb._tick = (mb._tick || 0) + dt;
            if (mb._tick > 0.12) {
              mb._tick = 0;
              term.sfx.tick();
            }
          },
        });
        if (hov && ui.down) ui.text(x + 2, y + 10, '咔哒 咔哒...', C.dim, bg);
      }
    }

    // ---------------------------------------------------- back door
    {
      const x = COLX[2];
      const y = ROWY[1];
      const pw = powered('C8');
      const bg = card(ui, x, y, '后门', 'BACK DOOR / 12', { unpowered: false });
      const locked = pw && state.backLock;
      icon(ui, x, y, ['▐▀▀▀▌', locked ? '▐ ■ ▌' : '▐ ░ ▌', '▐▄▄▄▌'], locked ? C.cy : C.red, bg);
      const n = roomState('12').noise;
      ui.text(x + 2, y + 5, '磁锁', C.dim, bg);
      ui.text(x + 7, y + 5, !pw ? '无供电' : locked ? '锁定' : '未锁', locked ? C.cy : C.red, bg);
      ui.text(x + 2, y + 6, '声学', C.dim, bg);
      ui.text(x + 7, y + 6, `${n.toFixed(0)}dB`, n > 45 ? C.yel : C.fg, bg);
      ui.text(x + 12, y + 6, n > 45 ? '!!' : '  ', C.yel, bg);
      ui.pushButton('backlock', x + 2, y + 8, 13, state.backLock ? '■ 解锁' : '□ 上锁', () => {
        state.backLock = !state.backLock;
        state.backLock ? term.sfx.on() : term.sfx.off();
        log(`后门磁锁${state.backLock ? '已锁定' : '已解锁'}.`, state.backLock ? 'info' : 'warn');
        changed();
      }, { disabled: !pw, active: locked });
      ui.text(x + 1, y + 10, fit('你看不到它.', W - 2, 'center'), C.dim2, bg);
    }

    // ---------------------------------------------------- thermostat
    {
      const x = COLX[3];
      const y = ROWY[1];
      const bg = card(ui, x, y, '温控', 'THERMOSTAT');
      const t = state.temp;
      ui.text(x + 4, y + 2, `${t.toFixed(1)}°C`, t > 30 ? C.red : t > 27 ? C.yel : C.hi, bg);
      ui.bar(x + 2, y + 3, 14, (t - 15) / 25, { fg: t > 30 ? C.red : t > 27 ? C.yel : C.cy, blocky: true });
      ui.text(x + 2, y + 5, '15°', C.dim2, bg);
      ui.text(x + 13, y + 5, '40°', C.dim2, bg);
      ui.text(x + 2, y + 6, state.heater ? '暖气 1.50kW' : '暖气 待机', state.heater ? C.yel : C.fg, bg);
      ui.pushButton('heat', x + 2, y + 8, 13, state.heater ? '■ 关暖气' : '□ 开暖气', () => {
        state.heater = !state.heater;
        state.heater ? term.sfx.on() : term.sfx.off();
        changed();
      }, { active: state.heater });
    }
  },
};
