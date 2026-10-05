// The security terminal: boot sequence, chrome (status bar / menu / footer),
// page navigation with line-by-line output, character mouse cursor.
import { Screen, C, COLS, ROWS, fit, strWidth } from './screen.js';
import { UI } from './ui.js';
import { state, clockString, currentLoad, on } from '../state.js';
import { homePage } from './pages/home.js';
import { powerPage } from './pages/power.js';
import { mapPage } from './pages/map.js';
import { facilityPage } from './pages/facility.js';
import { tasksPage } from './pages/tasks.js';

const LINE_MS = 11;          // line-by-line output speed
const CONTENT_TOP = 2;       // rows 0-1 are status + menu bars

const BOOT = [
  ['STARLIGHT SYSTEMS BIOS  v1.07   (C) 1989-1993 STARLIGHT ENTERTAINMENT INC.', C.hi],
  ['', 0],
  ['CPU : 80486DX2-66            ', C.fg],
  ['MEM : @MEM', C.fg],
  ['', 0],
  ['DETECTING IDE PRIMARY MASTER ... ST3243A  (214MB)', C.fg],
  ['DETECTING SENSOR BUS  ......... 12 NODES', C.fg],
  ['DETECTING SERIAL COM1 ......... DOOR-LIGHT RELAY BOX', C.fg],
  ['DETECTING SERIAL COM2 ......... HVAC CONTROLLER', C.fg],
  ['', 0],
  ['STARTING SEC-OS ...', C.cy],
  ['', 0],
  ['HIMEM.SYS   OK', C.dim],
  ['CCDOS 中文系统 2.13   已加载', C.dim],
  ['SENSNET.EXE /NODES:12 /POLL:250   OK', C.dim],
  ['RELAY.DRV  COM1:9600,N,8,1        OK', C.dim],
  ['WARNING: NIGHT MODE. PERFORMERS IN FREE-ROAM.', C.yel],
  ['', 0],
  ['C:\\> SECOS.EXE', C.hi],
];

export class Terminal {
  constructor(sfx) {
    this.sfx = sfx;
    this.screen = new Screen();
    this.ui = new UI(this.screen, sfx);
    this.pages = {
      home: homePage,
      power: powerPage,
      map: mapPage,
      facility: facilityPage,
      tasks: tasksPage,
    };
    for (const p of Object.values(this.pages)) p.init?.(this);
    this.page = null;
    this.pageKey = null;
    this.revealStart = 0;
    this.time = 0;
    this.mode = 'off';        // off -> boot -> ui
    this.bootT = 0;
    this.focused = false;
    this.glitch = 0;
    this.glitchRows = null;
    this.dirtySound = 0;
    this.spin = 0;
    this.flash = null;        // {msg, until}
    on('log', () => {});
  }

  powerOn() {
    this.mode = 'boot';
    this.bootT = 0;
    this.sfx.post();
  }

  go(key) {
    if (this.pageKey === key) return;
    this.page?.leave?.(this);
    this.pageKey = key;
    this.page = this.pages[key];
    this.page.enter?.(this);
    this.revealStart = this.time;
    this.sfx.page();
  }

  // re-run line output on the current page (used when a panel changes a lot)
  reprint() {
    this.revealStart = this.time;
  }

  toast(msg, level = 'info') {
    this.flash = { msg, level, until: this.time + 3.2 };
  }

  triggerGlitch(dur = 0.18) {
    this.glitch = Math.max(this.glitch, dur);
  }

  setMouse(cell) {
    this.ui.mouse = cell;
  }

  mouseDown(cell) {
    this.ui.down = true;
    if (this.mode !== 'ui' || !cell) return;
    if (this.revealing()) return; // ignore clicks while printing
    if (this.ui.click(cell)) this.sfx.click();
  }

  mouseUp() {
    this.ui.down = false;
  }

  revealing() {
    return this.revealRow() < ROWS;
  }

  revealRow() {
    return CONTENT_TOP + Math.floor(((this.time - this.revealStart) * 1000) / LINE_MS);
  }

  update(dt) {
    this.time += dt;
    this.spin += dt;
    if (this.mode === 'boot') {
      this.bootT += dt;
      if (this.bootT > 4.2) {
        this.mode = 'ui';
        this.go('home');
      }
    }
    for (const p of Object.values(this.pages)) p.tick?.(this, dt);
    if (this.mode === 'ui') {
      this.page?.update?.(this, dt);
      if (this.ui.down && this.ui.mouse && !this.revealing()) this.ui.hold(this.ui.mouse, dt);
    }
    if (this.glitch > 0) {
      this.glitch -= dt;
      this.glitchRows = {};
      for (let i = 0; i < 4; i++) {
        this.glitchRows[(Math.random() * ROWS) | 0] = ((Math.random() - 0.5) * 24) | 0;
      }
    } else this.glitchRows = null;
  }

  draw() {
    const s = this.screen;
    const ui = this.ui;
    if (this.mode === 'off') {
      s.clear(C.black);
      s.render({ persistence: 0.7 });
      return;
    }
    if (this.mode === 'boot') {
      this.drawBoot();
      return;
    }
    s.clear(C.bg, C.fg);
    ui.begin(this.time);
    this.drawStatus();
    this.drawMenu();
    this.page.draw(this, ui);
    this.drawFooter();
    ui.end();

    if (this.glitch > 0) this.scramble();

    // character-mode mouse cursor: inverted cell
    const m = ui.mouse;
    if (this.focused && m) s.invert(m.x, m.y, 1, 1);

    s.render({
      revealFrom: CONTENT_TOP,
      reveal: this.revealRow(),
      persistence: 0.45,
      glitchRows: this.glitchRows,
    });
  }

  drawBoot() {
    const s = this.screen;
    s.clear(C.black, C.fg);
    const t = this.bootT;
    // memory counter on line 3
    const memK = Math.min(640, Math.floor(t * 900));
    const lines = Math.floor((t - 0.2) / 0.16);
    BOOT.forEach(([txt, col], i) => {
      if (i > lines) return;
      const str = txt.replace('@MEM', `${String(memK).padStart(4)}K ${memK >= 640 ? 'OK' : ''}`);
      s.text(1, 1 + i, str, col || C.fg, C.black);
    });
    // small starlight logo, top right
    const logo = ['   ·  ★  ·   ', ' STARLIGHT  ', ' SEC-OS 2.31'];
    logo.forEach((l, i) => s.text(64, 1 + i, l, i === 0 ? C.yel : C.cy, C.black));
    if (Math.floor(t * 3) % 2 === 0) s.text(1, 2 + Math.min(lines, BOOT.length), '_', C.hi, C.black);
    // progress bar
    const p = Math.min(1, t / 4.0);
    s.text(1, 27, 'LOADING', C.dim, C.black);
    for (let i = 0; i < 60; i++) s.set(10 + i, 27, i < p * 60 ? '█' : '░', i < p * 60 ? C.cy : C.dim2, C.black);
    s.render({ persistence: 0.5 });
  }

  drawStatus() {
    const ui = this.ui;
    const s = this.screen;
    s.fill(0, 0, COLS, 1, ' ', C.ink, C.inv);
    const spin = '|/-\\'[Math.floor(this.spin * 8) % 4];
    const hdd = Math.random() < 0.15 ? '■' : '□';
    let x = 0;
    x += ui.text(x, 0, ' ★ ', C.bg, C.inv);
    x += ui.text(x, 0, 'SEC-OS', C.ink, C.inv);
    x += ui.text(x, 0, ' │ ', C.dim, C.inv);
    x += ui.text(x, 0, `第${state.night}夜`, C.ink, C.inv);
    x += ui.text(x, 0, ' │ ', C.dim, C.inv);
    // power
    x += ui.text(x, 0, '⚡电量 ', C.ink, C.inv);
    const pw = state.power === Infinity ? '∞' : `${Math.ceil(state.power)}%`;
    x += ui.text(x, 0, pw.padStart(4), '#a01010', C.inv);
    x += ui.text(x, 0, ' │ ', C.dim, C.inv);
    x += ui.text(x, 0, `负载${currentLoad().toFixed(1)}kW`, C.ink, C.inv);
    x += ui.text(x, 0, ' │ ', C.dim, C.inv);
    // clock
    const colon = Math.floor(this.time * 2) % 2 ? ':' : ' ';
    const clk = clockString().replace(':', colon);
    x += ui.text(x, 0, '◷ ', C.ink, C.inv);
    x += ui.text(x, 0, `${clk} AM`, C.bg, C.inv);
    x += ui.text(x, 0, ' │ ', C.dim, C.inv);
    x += ui.text(x, 0, `${state.temp.toFixed(1)}°C`, C.ink, C.inv);
    // right side decorations
    const right = `HDD${hdd} COM1${spin} ${state.date}`;
    ui.text(COLS - strWidth(right) - 1, 0, right, C.dim2, C.inv);
  }

  drawMenu() {
    const ui = this.ui;
    const y = 1;
    this.screen.fill(0, y, COLS, 1, ' ', C.fg, C.bg2);
    const items = [
      ['home', '⌂ 主页'],
      ['power', 'ϟ 电力'],
      ['map', '▦ 地图'],
      ['facility', '☼ 设施'],
      ['tasks', '✓ 任务'],
    ];
    let x = 1;
    for (const [k, label] of items) {
      const active = this.pageKey === k;
      const w = strWidth(label) + 2;
      const hov = ui.hit('menu-' + k, x, y, w, 1, () => this.go(k));
      const fg = hov ? C.ink : active ? C.ink : C.fg;
      const bg = hov ? C.hi : active ? C.cy : C.bg2;
      ui.text(x, y, ` ${label} `, fg, bg);
      x += w + 1;
    }
    const path = this.page?.path || 'C:\\SEC>';
    ui.text(COLS - strWidth(path) - 1, y, path, C.dim, C.bg2);
  }

  drawFooter() {
    const ui = this.ui;
    const y = ROWS - 1;
    this.screen.fill(0, y, COLS, 1, ' ', C.fg, C.bg2);
    let msg;
    let col = C.fg;
    if (this.flash && this.flash.until > this.time) {
      msg = this.flash.msg;
      col = this.flash.level === 'warn' ? C.yel : this.flash.level === 'err' ? C.red : C.hi;
    } else {
      const last = state.log[state.log.length - 1];
      msg = last ? `[${last.t}] ${last.msg}` : '系统就绪.';
      col = last && last.level === 'warn' ? C.yel : C.dim;
    }
    ui.text(1, y, fit('» ' + msg, 54), col, C.bg2);
    const hint = '右键/ESC 离开终端';
    ui.text(COLS - strWidth(hint) - 1, y, hint, C.dim, C.bg2);
  }

  scramble() {
    const s = this.screen;
    const junk = '▓▒░█▄▀#@%&$?¦';
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * COLS) | 0;
      const y = (Math.random() * ROWS) | 0;
      s.set(x, y, junk[(Math.random() * junk.length) | 0], Math.random() < 0.5 ? C.hi : C.cy);
    }
  }
}
