// The security terminal: boot sequence, chrome (status bar / menu + hotbar
// / footer), page navigation with line-by-line output, character cursor,
// plus full-screen modes for the main menu and the shift report.
import { Screen, C, COLS, ROWS, fit, strWidth } from './screen.js';
import { UI } from './ui.js';
import { game } from '../game.js';
import { homePage } from './pages/home.js';
import { powerPage } from './pages/power.js';
import { mapPage } from './pages/map.js';
import { facilityPage } from './pages/facility.js';
import { tasksPage } from './pages/tasks.js';
import { menuPage } from './pages/menu.js';
import { resultPage } from './pages/result.js';
import { manualPage } from './pages/manual.js';

const LINE_MS = 11;
const CONTENT_TOP = 2;
const BOOT_TIME = 3.4;

function bootLines(night) {
  return [
    ['STARLIGHT SYSTEMS BIOS  v1.07   (C) 1989-1993', C.hi],
    ['', 0],
    ['CPU : 80486DX2-66', C.fg],
    ['MEM : @MEM', C.fg],
    ['', 0],
    ['DETECTING IDE PRIMARY MASTER ... ST3243A  (214MB)', C.fg],
    ['DETECTING SENSOR BUS  ......... 12 NODES', C.fg],
    ['DETECTING SERIAL COM1 ......... DOOR-LIGHT RELAY BOX', C.fg],
    ['DETECTING SERIAL COM2 ......... HVAC CONTROLLER', C.fg],
    ['', 0],
    ['STARTING SEC-OS ...', C.cy],
    ['HIMEM.SYS   OK', C.dim],
    ['CCDOS 中文系统 2.13   已加载', C.dim],
    ['SENSNET.EXE /NODES:12 /POLL:250   OK', C.dim],
    ['RELAY.DRV  COM1:9600,N,8,1        OK', C.dim],
    [`SHIFT: ${game.nightName(night)}   00:00 — 06:00`, C.yel],
    ['WARNING: NIGHT MODE. PERFORMERS IN FREE-ROAM.', C.yel],
    ['', 0],
    ['C:\\> SECOS.EXE', C.hi],
  ];
}

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
      menu: menuPage,
      result: resultPage,
      manual: manualPage,
    };
    for (const p of Object.values(this.pages)) p.init?.(this);
    this.page = null;
    this.pageKey = null;
    this.revealStart = 0;
    this.time = 0;
    this.mode = 'off';        // off | menu | boot | ui | result | dead
    this.bootT = 0;
    this.focused = false;
    this.glitch = 0;
    this.glitchRows = null;
    this.spin = 0;
    this.flash = null;
  }

  get world() {
    return game.world;
  }

  showMenu() {
    this.mode = 'menu';
    this.pageKey = null;
    this.go('menu');
  }

  startNight() {
    for (const p of Object.values(this.pages)) p.reset?.(this);
    this.mode = 'boot';
    this.bootT = 0;
    this.pageKey = null;
    this.sfx.post();
  }

  showResult() {
    this.mode = 'result';
    this.pageKey = null;
    this.go('result');
  }

  go(key) {
    if (this.pageKey === key) return;
    this.page?.leave?.(this);
    this.pageKey = key;
    this.page = this.pages[key];
    this.page.enter?.(this);
    this.revealStart = this.time;
    this.sfx.page();
    if (this.world) game.cmd('page', { page: key });
  }

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
    if (!cell || !['menu', 'ui', 'result'].includes(this.mode)) return;
    if (this.revealing()) return;
    // overheated terminal: clicks sometimes land on a neighbouring cell
    const w = this.world;
    if (w && this.mode === 'ui' && w.temp.eff >= w.P.temp.fault && Math.random() < 0.1) {
      cell = { x: cell.x + (Math.random() < 0.5 ? -1 : 1), y: cell.y };
    }
    if (this.ui.click(cell)) this.sfx.click();
  }

  mouseUp() {
    this.ui.down = false;
  }

  revealing() {
    return this.revealRow() < ROWS;
  }

  revealRow() {
    const top = this.mode === 'ui' ? CONTENT_TOP : 0;
    return top + Math.floor(((this.time - this.revealStart) * 1000) / LINE_MS);
  }

  // command helper for pages: runs a sim command and reports failures
  cmd(name, args, okSound) {
    const r = game.cmd(name, args);
    if (r && r.ok === false && r.msg) {
      this.sfx.error();
      this.toast(r.msg, 'err');
    } else if (okSound) this.sfx[okSound]();
    return r;
  }

  update(dt) {
    this.time += dt;
    this.spin += dt;
    const w = this.world;
    if (this.mode === 'boot') {
      this.bootT += dt;
      if (this.bootT > BOOT_TIME) {
        this.mode = 'ui';
        this.go('home');
      }
    }
    // overheat reboot
    if (w && this.mode === 'ui' && w.temp.rebootT > 0) {
      this.mode = 'boot';
      this.bootT = -w.temp.rebootT + 1.5;
    }
    if (['ui', 'menu', 'result'].includes(this.mode)) {
      for (const p of Object.values(this.pages)) if (w) p.tick?.(this, dt);
      this.page?.update?.(this, dt);
      if (this.ui.down && this.ui.mouse && !this.revealing()) this.ui.hold(this.ui.mouse, dt);
    }
    let g = this.glitch;
    if (w && w.temp.eff >= w.P.temp.fault && Math.random() < dt * 0.6) this.glitch = Math.max(this.glitch, 0.12);
    if (g > 0 || this.glitch > 0) {
      this.glitch -= dt;
      this.glitchRows = {};
      for (let i = 0; i < 4; i++) this.glitchRows[(Math.random() * ROWS) | 0] = ((Math.random() - 0.5) * 24) | 0;
    } else this.glitchRows = null;
  }

  draw() {
    const s = this.screen;
    const ui = this.ui;
    if (this.mode === 'off' || this.mode === 'dead') {
      s.clear(C.black);
      s.render({ persistence: 0.75 });
      return;
    }
    if (this.mode === 'boot') {
      this.drawBoot();
      return;
    }
    s.clear(C.bg, C.fg);
    ui.begin(this.time);
    if (this.mode === 'ui') {
      this.drawStatus();
      this.drawMenu();
      const w = this.world;
      if (w.pageLock && w.pageLock.t > 0 && w.pageLock.page === this.pageKey) this.drawDenied(w.pageLock.t);
      else this.page.draw(this, ui);
      this.drawFooter();
    } else {
      this.page.draw(this, ui);
    }
    ui.end();
    if (this.glitch > 0) this.scramble();
    const m = ui.mouse;
    if (this.focused && m) s.invert(m.x, m.y, 1, 1);
    s.render({
      revealFrom: this.mode === 'ui' ? CONTENT_TOP : 0,
      reveal: this.revealRow(),
      persistence: 0.45,
      glitchRows: this.glitchRows,
    });
  }

  // STARLIGHT has this page
  drawDenied(t) {
    const s = this.screen;
    s.fill(0, 2, COLS, ROWS - 3, ' ', C.red, '#2a0606');
    const junk = '▓▒░█STARLIGHT';
    for (let i = 0; i < 160; i++) s.set((Math.random() * COLS) | 0, 2 + ((Math.random() * (ROWS - 3)) | 0), junk[(Math.random() * junk.length) | 0], '#5a1010');
    this.ui.center(12, ' ACCESS DENIED ', C.hi, '#8a0c0c');
    this.ui.center(14, `该页面已被 STARLIGHT 锁定 · ${Math.ceil(t)}s`, '#ff9090');
    this.ui.center(16, '用快捷栏撑过去.', '#a06060');
  }

  drawBoot() {
    const s = this.screen;
    s.clear(C.black, C.fg);
    const t = this.bootT;
    if (t < 0) {
      s.text(2, 2, '过热保护 — 等待冷却...', C.red, C.black);
      s.render({ persistence: 0.6 });
      return;
    }
    const lines = bootLines(game.night);
    const memK = Math.min(640, Math.floor(t * 1200));
    const shown = Math.floor((t - 0.15) / 0.13);
    lines.forEach(([txt, col], i) => {
      if (i > shown) return;
      s.text(1, 1 + i, txt.replace('@MEM', `${String(memK).padStart(4)}K ${memK >= 640 ? 'OK' : ''}`), col || C.fg, C.black);
    });
    ['   ·  ★  ·   ', ' STARLIGHT  ', ' SEC-OS 2.31'].forEach((l, i) => s.text(64, 1 + i, l, i === 0 ? C.yel : C.cy, C.black));
    if (Math.floor(t * 3) % 2 === 0) s.text(1, 2 + Math.min(shown, lines.length), '_', C.hi, C.black);
    const p = Math.min(1, t / (BOOT_TIME - 0.3));
    s.text(1, 27, 'LOADING', C.dim, C.black);
    for (let i = 0; i < 60; i++) s.set(10 + i, 27, i < p * 60 ? '█' : '░', i < p * 60 ? C.cy : C.dim2, C.black);
    s.render({ persistence: 0.5 });
  }

  drawStatus() {
    const ui = this.ui;
    const s = this.screen;
    const w = this.world;
    s.fill(0, 0, COLS, 1, ' ', C.ink, C.inv);
    let x = 0;
    const sep = () => (x += ui.text(x, 0, '│', C.dim, C.inv));
    x += ui.text(x, 0, ' ★ ', C.bg, C.inv);
    x += ui.text(x, 0, game.nightName(game.night), C.ink, C.inv);
    x += 1;
    sep();
    const pct = w.powerPct();
    const pcol = pct < 15 ? '#c01010' : C.ink;
    x += ui.text(x, 0, ` ϟ${pct.toFixed(0).padStart(3)}% `, pcol, C.inv);
    sep();
    x += ui.text(x, 0, ` ${w.power.load.toFixed(1)}kW `, w.power.tripped ? '#c01010' : C.ink, C.inv);
    sep();
    const colon = Math.floor(this.time * 2) % 2 ? ':' : ' ';
    const clk = w.overtime && !w.clockStuck ? `${w.clock().replace(':', colon)} OT` : `${w.clock().replace(':', colon)} AM`;
    x += ui.text(x, 0, ` ◷ ${clk} `, w.overtime ? '#c01010' : C.bg, C.inv);
    sep();
    const te = w.temp.eff;
    x += ui.text(x, 0, ` ${w.temp.room.toFixed(1)}°C `, te >= w.P.temp.fault ? '#c01010' : C.ink, C.inv);
    sep();
    x += ui.text(x, 0, ` ♪${w.noise.db.toFixed(0)}dB `, w.noise.db > 38 ? '#a06000' : C.ink, C.inv);
    if (w.phone.state === 'call' || w.phone.state === 'ringing') {
      sep();
      const ring = w.phone.state === 'ringing';
      // the phone is on the desk: pick it up there (leave the terminal)
      const label = ring ? (Math.floor(this.time * 4) % 2 ? ' ☎ 来电·桌上 ' : ' ☎          ') : ' ☎ 通话 ';
      x += ui.text(x, 0, label, '#a01010', C.inv);
    }
    const right = game.debug ? ' DEBUG ' : `HDD${Math.random() < 0.15 ? '■' : '□'} `;
    ui.text(COLS - strWidth(right), 0, right, game.debug ? C.hi : C.dim2, game.debug ? '#a01010' : C.inv);
  }

  drawMenu() {
    const ui = this.ui;
    const w = this.world;
    const y = 1;
    this.screen.fill(0, y, COLS, 1, ' ', C.fg, C.bg2);
    const items = [
      ['home', '⌂主页'],
      ['power', 'ϟ电力'],
      ['map', '▦地图'],
      ['facility', '☼设施'],
      ['tasks', '✓任务'],
      ['manual', '?'],
    ];
    let x = 0;
    for (const [k, label] of items) {
      const active = this.pageKey === k;
      const wdt = strWidth(label) + 2;
      const hov = ui.hit('menu-' + k, x, y, wdt, 1, () => this.go(k));
      const pending = k === 'tasks' && w.tasks.some((t) => !t.done);
      ui.text(x, y, ` ${label} `, hov || active ? C.ink : C.fg, hov ? C.hi : active ? C.cy : C.bg2);
      if (pending && !active && !hov) ui.text(x + wdt - 1, y, '•', C.yel, C.bg2);
      x += wdt;
    }
    // hotbar: works from any page
    const hb = (id, label, active, fn, warn) => {
      const wdt = strWidth(label);
      const hov = ui.hit('hb-' + id, x, y, wdt, 1, fn);
      let fg = active ? C.ink : warn ? C.red : C.cy;
      let bg = active ? C.yel : C.bg2;
      if (hov) {
        fg = C.ink;
        bg = C.hi;
      }
      ui.text(x, y, label, fg, bg);
      x += wdt + 1;
    };
    x = 46;
    ui.text(x - 2, y, '┃', C.dim2, C.bg2);
    const dl = (side) => {
      const d = w.doors[side];
      const lit = w.doorLit(side);
      const broken = d.broken;
      const hot = d.heat > w.P.doorLight.warn;
      const label = side === 'L' ? `◄${broken ? '×' : hot ? '!' : ' '}左灯` : `右灯${broken ? '×' : hot ? '!' : ' '}►`;
      hb(side, label, lit, () => {
        const r = game.cmd('doorLight', { side });
        if (r.ok === false) {
          this.sfx.error();
          this.toast(r.msg || '无法开启', 'err');
        } else (w.doors[side].on ? this.sfx.on() : this.sfx.off());
      }, broken);
    };
    dl('L');
    dl('R');
    if (game.night >= 3 || game.debug) {
      hb('lock', w.office.maglock ? '■锁' : '□锁', w.office.maglock, () => this.cmd('maglock', {}, w.office.maglock ? 'off' : 'on'), w.office.coilLockout > 0);
    }
    {
      const jam = w.paJam > 0;
      const ok = w.lastLureRoom && w.lureCooldown <= 0 && !jam && !w.rooms[w.lastLureRoom]?.offline;
      hb('relure', jam ? '♪××' : w.lastLureRoom ? `♪${w.lastLureRoom}` : '♪--', false, () => this.cmd('lureRepeat', {}, 'ok'), !ok);
    }
    if (game.night >= 2 || game.debug) {
      const cd = w.emi.cooldown > 0;
      hb('degauss', cd ? '消磁…' : '消磁', false, () => this.cmd('degauss', {}, null));
    }
  }

  drawFooter() {
    const ui = this.ui;
    const w = this.world;
    const y = ROWS - 1;
    const em = w.emergencies[0];
    if (em) {
      const blink = Math.floor(this.time * 3) % 2;
      this.screen.fill(0, y, COLS, 1, ' ', C.hi, blink ? '#8a0c0c' : '#5a0606');
      const label = {
        'E-1': `⚠ E-1 ${em.side === 'L' ? '左' : '右'}门灯管烧坏 · 备件 ${w.spares}`,
        'E-2': `⚠ E-2 节点 ${em.side} 离线 · 到地图重启`,
        'E-3': '⚠ E-3 冷库压缩机故障 · 完成 T-07',
        'E-4': '⚠ E-4 主闸跳闸 · 全馆断电',
        'E-5': '⚠ E-5 电网故障 · 蓄电池供电 · 发电机待点火 (T-06)',
      }[em.id] || `⚠ ${em.id}`;
      ui.text(1, y, label, C.hi, blink ? '#8a0c0c' : '#5a0606');
      const target = { 'E-4': 'power', 'E-2': 'map', 'E-3': 'tasks', 'E-5': 'tasks' }[em.id] || 'facility';
      ui.button('em-go', COLS - 12, y, ' 前往处理 ', () => this.go(target), { raw: false, fg: C.yel });
      return;
    }
    this.screen.fill(0, y, COLS, 1, ' ', C.fg, C.bg2);
    let msg;
    let col;
    if (this.flash && this.flash.until > this.time) {
      msg = this.flash.msg;
      col = this.flash.level === 'warn' ? C.yel : this.flash.level === 'err' ? C.red : C.hi;
    } else {
      const last = w.logLines[w.logLines.length - 1];
      msg = last ? `[${last.t}] ${last.msg}` : '系统就绪.';
      col = last && last.level === 'warn' ? C.yel : last && last.level === 'err' ? C.red : C.dim;
    }
    ui.text(1, y, fit('» ' + msg, 60), col, C.bg2);
    const hint = '右键/ESC 离开';
    ui.text(COLS - strWidth(hint) - 1, y, hint, C.dim, C.bg2);
  }

  scramble() {
    const s = this.screen;
    const junk = '▓▒░█▄▀#@%&$?¦';
    for (let i = 0; i < 40; i++) {
      s.set((Math.random() * COLS) | 0, (Math.random() * ROWS) | 0, junk[(Math.random() * junk.length) | 0], Math.random() < 0.5 ? C.hi : C.cy);
    }
  }
}
