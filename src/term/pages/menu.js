// Main menu, drawn on the CRT itself.
import { C, COLS, fit, strWidth } from '../screen.js';
import { save } from '../../save.js';
import { NIGHTS } from '../../sim/index.js';

let view = 'main'; // main | nights | settings | confirm
let tip = '';

const LOGO = [
  '███  ██ ███ ████ ██  ██ ████   ████ ██  ██ ███ ████ ██████',
  '████ ██  █  ██   ██  ██  ██    ██   ██  ██  █  ██     ██  ',
  '██ ████  █  █ ██ ██████  ██    ████ ██████  █  ███    ██  ',
  '██  ███  █  ██ █ ██  ██  ██      ██ ██  ██  █  ██     ██  ',
  '██   ██ ███ ████ ██  ██  ██    ████ ██  ██ ███ ██     ██  ',
];

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function btn(ui, term, id, y, label, fn, opts = {}) {
  const w = 30;
  const x = Math.floor((COLS - w) / 2);
  const hov = ui.pushButton(id, x, y, w, label, fn, opts);
  if (hov && opts.tip) tip = opts.tip;
}

export const menuPage = {
  enter() {
    view = 'main';
  },

  draw(term, ui) {
    const d = save.data;
    const dbg = d.settings.debug;
    tip = '';
    ui.fill(0, 0, COLS, 30, C.bg);
    // header strip
    ui.fill(0, 0, COLS, 1, C.inv);
    ui.text(1, 0, '★ STARLIGHT SEC-OS 2.31', C.ink, C.inv);
    const r = dbg ? ' DEBUG ' : ' LOGIN ';
    ui.text(COLS - strWidth(r) - 1, 0, r, dbg ? C.hi : C.ink, dbg ? '#a01010' : C.inv);
    LOGO.forEach((l, i) => ui.text(11, 2 + i, l, i < 2 ? C.hi : C.cy));
    ui.center(8, '—— 星光披萨乐园 · 夜班值守 ——', C.dim);

    if (view === 'main') this.drawMain(term, ui, d, dbg);
    else if (view === 'nights') this.drawNights(term, ui, d, dbg);
    else if (view === 'settings') this.drawSettings(term, ui, d);
    else if (view === 'confirm') this.drawConfirm(term, ui);

    // footer
    ui.fill(0, 29, COLS, 1, C.bg2);
    ui.text(1, 29, fit(tip || save.warning || '鼠标操作 · 建议佩戴耳机', 60), save.warning && !tip ? C.yel : C.dim, C.bg2);
    ui.text(COLS - 14, 29, 'v0.3 · M1', C.dim2, C.bg2);
  },

  drawMain(term, ui, d, dbg) {
    const cur = d.progress.currentNight;
    let y = 11;
    btn(ui, term, 'm-continue', y, `▶ 继续 · ${NIGHTS[cur].name}`, () => term.actions.start(cur, dbg), { tip: '从当前进度开始' });
    y += 3;
    btn(ui, term, 'm-new', y, '新游戏', () => {
      if (d.progress.maxNightCleared > 0) view = 'confirm';
      else term.actions.start(1, dbg);
    }, { tip: '从第 1 夜开始' });
    y += 3;
    btn(ui, term, 'm-nights', y, '选择夜晚', () => {
      view = 'nights';
      term.reprint();
    }, { tip: dbg ? '调试模式: 所有夜晚可选' : '已通过的夜晚可以重玩' });
    y += 3;
    btn(ui, term, 'm-settings', y, '设置', () => {
      view = 'settings';
      term.reprint();
    });
    y += 3;
    btn(ui, term, 'm-debug', y, `调试模式 [${dbg ? '开' : '关'}]`, () => {
      save.setting('debug', !dbg);
      dbg ? term.sfx.off() : term.sfx.on();
    }, { active: dbg, tip: '开启: 任意选夜 + 夜间信息面板 (F1) · 不写入进度' });
    // progress summary
    const x = 60;
    ui.text(x, 11, '值班记录', C.dim);
    for (let n = 1; n <= 6; n++) {
      const rec = d.nights[n];
      ui.text(x, 12 + n, `第${n}夜`, rec?.cleared ? C.fg : C.dim2);
      ui.text(x + 6, 12 + n, stars(rec?.stars || 0), rec?.cleared ? C.yel : C.dim2);
    }
  },

  drawNights(term, ui, d, dbg) {
    ui.center(10, '选择夜晚', C.hi);
    const list = dbg ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
    list.forEach((n, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 14 + col * 28;
      const y = 12 + row * 4;
      const unlocked = dbg || n <= d.progress.currentNight;
      const rec = d.nights[n];
      const label = n === 0 ? '空夜 (测试)' : `${NIGHTS[n].name}  ${stars(rec?.stars || 0)}`;
      const hov = ui.pushButton('n-' + n, x, y, 24, unlocked ? label : `${NIGHTS[n].name}  ▒锁定▒`, () => term.actions.start(n, dbg), { disabled: !unlocked });
      if (hov) tip = n === 0 ? '没有任何威胁, 用来测试机制和表现' : `储备 ${NIGHTS[n].reserve} · 任务 ${NIGHTS[n].tasks.join(' ')}`;
    });
    ui.pushButton('n-back', 33, 26, 14, '◄ 返回', () => {
      view = 'main';
      term.reprint();
    });
  },

  drawSettings(term, ui, d) {
    const s = d.settings;
    ui.center(10, '设置', C.hi);
    const rows = [
      ['masterVol', '主音量', 'num'],
      ['musicVol', '音乐 / 环境', 'num'],
      ['sfxVol', '音效', 'num'],
      ['brightness', '画面亮度', 'num'],
      ['crtIntensity', 'CRT 效果', 'num'],
      ['turnSpeed', '转头速度', 'num'],
      ['contextHints', '情境提示', 'bool'],
      ['audioCaptions', '声音提示字幕', 'bool'],
      ['reduceFlicker', '减少闪烁', 'bool'],
    ];
    rows.forEach(([k, label, type], i) => {
      const y = 12 + i * 1.5;
      const yy = Math.floor(12 + i * 1.5);
      ui.text(20, yy, label, C.fg);
      if (type === 'num') {
        const v = s[k];
        ui.button(`s-${k}-`, 38, yy, '◄', () => save.setting(k, Math.max(0, Math.round((v - 0.1) * 10) / 10)), {});
        ui.bar(42, yy, 14, Math.min(1, v / (k === 'turnSpeed' || k === 'brightness' ? 2 : 1)), { fg: C.cy });
        ui.button(`s-${k}+`, 57, yy, '►', () => save.setting(k, Math.min(k === 'turnSpeed' || k === 'brightness' ? 2 : 1, Math.round((v + 0.1) * 10) / 10)), {});
        ui.text(62, yy, `${Math.round(v * 100)}%`, C.dim);
      } else {
        ui.toggle(`s-${k}`, 38, yy, s[k], s[k] ? '开' : '关', () => save.setting(k, !s[k]));
      }
      void y;
    });
    ui.pushButton('s-reset', 20, 26, 16, '清除存档', () => {
      save.reset();
      term.toast('存档已清除');
      term.sfx.off();
    }, { danger: true });
    ui.pushButton('s-back', 44, 26, 14, '◄ 返回', () => {
      view = 'main';
      term.reprint();
    });
  },

  drawConfirm(term, ui) {
    ui.box(20, 12, 40, 9, { style: 'double', fg: C.yel, shadow: true, title: '新游戏' });
    ui.center(14, '这会清除现有进度 (设置保留).', C.fg, null, 20, 40);
    ui.center(15, '确定吗?', C.hi, null, 20, 40);
    ui.pushButton('c-yes', 24, 18, 14, '确定', () => {
      save.reset();
      term.actions.start(1, save.data.settings.debug);
    }, { danger: true });
    ui.pushButton('c-no', 42, 18, 14, '取消', () => {
      view = 'main';
      term.reprint();
    });
  },
};
