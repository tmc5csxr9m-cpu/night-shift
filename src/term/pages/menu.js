// Main menu, drawn on the CRT itself.
import { C, COLS, fit, strWidth } from '../screen.js';
import { save } from '../../save.js';
import { NIGHTS } from '../../sim/index.js';
import { native, DEBUG_ALLOWED, VERSION } from '../../native.js';
import { drawManual } from './manual.js';

let view = 'main'; // main | nights | settings | confirm | manual | about

const DISPLAY = [
  ['fullscreen', '全屏'],
  ['1280x720', '窗口 1280×720'],
  ['1600x900', '窗口 1600×900'],
  ['1920x1080', '窗口 1920×1080'],
];
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
    const dbg = DEBUG_ALLOWED && d.settings.debug;
    tip = '';
    ui.fill(0, 0, COLS, 30, C.bg);
    // header strip
    ui.fill(0, 0, COLS, 1, C.inv);
    ui.text(1, 0, '★ STARLIGHT SEC-OS 2.31', C.ink, C.inv);
    const r = dbg ? ' DEBUG ' : ' LOGIN ';
    ui.text(COLS - strWidth(r) - 1, 0, r, dbg ? C.hi : C.ink, dbg ? '#a01010' : C.inv);
    if (view === 'manual') {
      drawManual(term, ui, { x: 1, y: 2, w: 78, h: 24 });
      ui.pushButton('man-return', 33, 27, 14, '◄ 返回', () => this.back(term));
    } else {
      LOGO.forEach((l, i) => ui.text(11, 2 + i, l, i < 2 ? C.hi : C.cy));
      ui.center(8, '—— 星光披萨乐园 · 夜班值守 ——', C.dim);
    }

    if (view === 'main') this.drawMain(term, ui, d, dbg);
    else if (view === 'about') this.drawAbout(term, ui);
    else if (view === 'nights') this.drawNights(term, ui, d, dbg);
    else if (view === 'settings') this.drawSettings(term, ui, d);
    else if (view === 'confirm') this.drawConfirm(term, ui);
    else if (view === 'confirmReset') this.drawConfirm(term, ui, true);

    // footer
    ui.fill(0, 29, COLS, 1, C.bg2);
    ui.text(1, 29, fit(tip || save.warning || '鼠标操作 · 建议佩戴耳机 · 主菜单长按 ESC 退出', 64), save.warning && !tip ? C.yel : C.dim, C.bg2);
    const ver = `v${VERSION}`;
    ui.text(COLS - strWidth(ver) - 1, 29, ver, C.dim2, C.bg2);
  },

  back(term) {
    view = 'main';
    term.reprint();
  },

  drawMain(term, ui, d, dbg) {
    const cur = d.progress.currentNight;
    const go = (v) => () => {
      view = v;
      term.reprint();
    };
    let y = 10;
    const step = 2;
    btn(ui, term, 'm-continue', y, `▶ 继续 · ${NIGHTS[cur].name}`, () => term.actions.start(cur, dbg), { tip: '从当前进度开始' });
    y += step;
    btn(ui, term, 'm-new', y, '新游戏', () => {
      if (d.progress.maxNightCleared > 0) view = 'confirm';
      else term.actions.start(1, dbg);
    }, { tip: '从第 1 夜开始' });
    y += step;
    btn(ui, term, 'm-nights', y, '选择夜晚', go('nights'), { tip: dbg ? '调试模式: 所有夜晚可选' : '已通过的夜晚可以重玩' });
    y += step;
    btn(ui, term, 'm-manual', y, '值班手册', go('manual'), { tip: '各个机制的说明 · 随夜数解锁 · 夜里也能用终端上的 ? 打开' });
    y += step;
    btn(ui, term, 'm-settings', y, '设置', go('settings'));
    y += step;
    btn(ui, term, 'm-about', y, '关于 / 版权', go('about'));
    y += step;
    if (DEBUG_ALLOWED) {
      btn(ui, term, 'm-debug', y, `调试模式 [${dbg ? '开' : '关'}]`, () => {
        save.setting('debug', !dbg);
        dbg ? term.sfx.off() : term.sfx.on();
      }, { active: dbg, tip: '开启: 任意选夜 + 夜间信息面板 (F1) · 不写入进度' });
      y += step;
    }
    btn(ui, term, 'm-quit', y, '退出游戏', () => native?.quit(), { tip: '也可以在主菜单长按 ESC 退出' });
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
    ui.pushButton('n-back', 33, 26, 14, '◄ 返回', () => this.back(term));
  },

  drawSettings(term, ui, d) {
    const s = d.settings;
    ui.center(9, '设置', C.hi);
    const rows = [
      ['masterVol', '主音量', 'num'],
      ['musicVol', '音乐 / 环境', 'num'],
      ['sfxVol', '音效', 'num'],
      ['brightness', '画面亮度', 'num'],
      ['crtIntensity', 'CRT 效果', 'num'],
      ['turnSpeed', '转头速度', 'num'],
      ['reduceFlicker', '减弱闪光', 'bool'],
      ['display', '显示模式', 'display'],
    ];
    rows.forEach(([k, label, type], i) => {
      const y = 11 + i * 2;
      const yy = y;
      ui.text(20, yy, label, C.fg);
      if (type === 'num') {
        const v = s[k];
        ui.button(`s-${k}-`, 38, yy, '◄', () => save.setting(k, Math.max(0, Math.round((v - 0.1) * 10) / 10)), {});
        ui.bar(42, yy, 14, Math.min(1, v / (k === 'turnSpeed' || k === 'brightness' ? 2 : 1)), { fg: C.cy });
        ui.button(`s-${k}+`, 57, yy, '►', () => save.setting(k, Math.min(k === 'turnSpeed' || k === 'brightness' ? 2 : 1, Math.round((v + 0.1) * 10) / 10)), {});
        ui.text(62, yy, `${Math.round(v * 100)}%`, C.dim);
      } else if (type === 'display') {
        const i = Math.max(0, DISPLAY.findIndex(([m]) => m === s.display));
        const hov = ui.pushButton('s-display', 38, yy, 22, `◄ ${DISPLAY[i][1]} ►`, () => {
          const next = DISPLAY[(i + 1) % DISPLAY.length][0];
          save.setting('display', next);
          native?.setDisplay(next);
        });
        if (hov) tip = '点击切换 · 立即生效 · 下次启动沿用';
      } else {
        const hov = ui.toggle(`s-${k}`, 38, yy, s[k], s[k] ? '开' : '关', () => save.setting(k, !s[k]));
        if (hov && k === 'reduceFlicker') tip = '关闭频闪、减弱闪烁与屏幕色彩脉动 (光敏人群建议开启)';
      }
      void y;
    });
    ui.pushButton('s-reset', 20, 27, 16, '清除存档', () => {
      view = 'confirmReset';
      term.reprint();
    }, { danger: true });
    ui.pushButton('s-back', 44, 27, 14, '◄ 返回', () => this.back(term));
  },

  drawAbout(term, ui) {
    ui.box(8, 10, 64, 16, { style: 'double', title: '关于 / 版权', shadow: true });
    const lines = [
      ['NIGHT SHIFT · 星光披萨乐园 · 夜班保安', C.hi],
      [`版本 ${VERSION}`, C.dim],
      ['', 0],
      ['本作由 AI 制作: 程序、关卡与平衡、3D 场景、音效、', C.fg],
      ['音乐与文字均由 Anthropic 的 Claude 生成。', C.fg],
      ['', 0],
      ['© 2026 @g_t_u (bilibili)  保留所有权利。', C.yel],
      ['未经许可, 不得复制、修改或再发布本作品。', C.yel],
      ['', 0],
      ['FNAF 同人作品, 与 Scott Cawthon 及 FNAF 官方无关。', C.dim],
      ['开源组件: three.js (MIT) · Electron (MIT) ·', C.dim],
      ['GNU Unifont (GPL-2.0+ 字体例外 / SIL OFL 1.1)', C.dim],
      ['完整许可文本见程序目录下的 LICENSES.txt。', C.dim],
    ];
    lines.forEach(([t, fg], i) => t && ui.text(11, 11 + i, t, fg));
    ui.pushButton('a-back', 33, 27, 14, '◄ 返回', () => this.back(term));
  },

  drawConfirm(term, ui, reset = false) {
    ui.box(20, 12, 40, 9, { style: 'double', fg: C.yel, shadow: true, title: reset ? '清除存档' : '新游戏' });
    ui.center(14, reset ? '所有夜晚的进度和星级都会被删除.' : '这会清除现有进度 (设置保留).', C.fg, null, 20, 40);
    ui.center(15, '确定吗?', C.hi, null, 20, 40);
    ui.pushButton('c-yes', 24, 18, 14, '确定', () => {
      save.reset();
      if (reset) {
        term.toast('存档已清除');
        term.sfx.off();
        view = 'settings';
        term.reprint();
      } else term.actions.start(1, DEBUG_ALLOWED && save.data.settings.debug);
    }, { danger: true });
    ui.pushButton('c-no', 42, 18, 14, '取消', () => {
      view = reset ? 'settings' : 'main';
      term.reprint();
    });
  },
};
