// Immediate-mode TUI widgets drawn on a Screen. Every frame the active page
// redraws itself and registers clickable regions; clicks are resolved
// against the regions of the last drawn frame.
import { C, strWidth, fit, COLS, charWidth } from './screen.js';

export const BOX = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', lt: '├', rt: '┤' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', lt: '╟', rt: '╢' },
  mixed: { tl: '╒', tr: '╕', bl: '╘', br: '╛', h: '═', v: '│', lt: '├', rt: '┤' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃', lt: '┣', rt: '┫' },
};

export class UI {
  constructor(screen, sfx) {
    this.s = screen;
    this.sfx = sfx;
    this.hits = [];
    this.mouse = null;        // {x,y} cell or null
    this.down = false;
    this.hover = null;        // id of hovered region
    this.lastHover = null;
    this.time = 0;
  }

  begin(time) {
    this.time = time;
    this.hits = [];
    this.hover = null;
  }

  end() {
    if (this.hover !== this.lastHover) {
      if (this.hover && this.sfx) this.sfx.hover();
      this.lastHover = this.hover;
    }
  }

  inside(x, y, w, h) {
    const m = this.mouse;
    return !!m && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
  }

  // register a clickable region. returns true when hovered.
  hit(id, x, y, w, h, onClick, opts = {}) {
    const hov = this.inside(x, y, w, h) && !opts.disabled;
    this.hits.push({ id, x, y, w, h, onClick, onHold: opts.onHold, disabled: opts.disabled });
    if (hov) this.hover = id;
    return hov;
  }

  click(cell) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (cell.x >= r.x && cell.x < r.x + r.w && cell.y >= r.y && cell.y < r.y + r.h) {
        if (r.disabled) {
          this.sfx?.error();
          return true;
        }
        if (r.onClick) r.onClick(cell.x - r.x, cell.y - r.y);
        return true;
      }
    }
    return false;
  }

  // called every frame while mouse is held
  hold(cell, dt) {
    if (!cell) return;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (cell.x >= r.x && cell.x < r.x + r.w && cell.y >= r.y && cell.y < r.y + r.h) {
        if (r.onHold && !r.disabled) r.onHold(dt);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  text(x, y, s, fg = C.fg, bg) {
    return this.s.text(x, y, s, fg, bg);
  }

  center(y, s, fg, bg, x0 = 0, w = COLS) {
    const x = x0 + Math.floor((w - strWidth(s)) / 2);
    this.s.text(x, y, s, fg, bg);
    return x;
  }

  fill(x, y, w, h, bg = C.bg, ch = ' ', fg) {
    this.s.fill(x, y, w, h, ch, fg, bg);
  }

  hline(x, y, w, ch = '─', fg = C.dim, bg) {
    for (let i = 0; i < w; i++) this.s.set(x + i, y, ch, fg, bg);
  }

  vline(x, y, h, ch = '│', fg = C.dim, bg) {
    for (let i = 0; i < h; i++) this.s.set(x, y + i, ch, fg, bg);
  }

  box(x, y, w, h, opts = {}) {
    const st = BOX[opts.style || 'single'];
    const fg = opts.fg || C.fg;
    const bg = opts.bg;
    if (opts.fill !== false) this.s.fill(x, y, w, h, ' ', fg, bg || C.bg);
    if (opts.shadow) this.shadow(x, y, w, h);
    this.s.set(x, y, st.tl, fg, bg);
    this.s.set(x + w - 1, y, st.tr, fg, bg);
    this.s.set(x, y + h - 1, st.bl, fg, bg);
    this.s.set(x + w - 1, y + h - 1, st.br, fg, bg);
    for (let i = 1; i < w - 1; i++) {
      this.s.set(x + i, y, st.h, fg, bg);
      this.s.set(x + i, y + h - 1, st.h, fg, bg);
    }
    for (let j = 1; j < h - 1; j++) {
      this.s.set(x, y + j, st.v, fg, bg);
      this.s.set(x + w - 1, y + j, st.v, fg, bg);
    }
    if (opts.title) {
      const t = ` ${opts.title} `;
      const tx = opts.titleAlign === 'left' ? x + 2 : x + Math.floor((w - strWidth(t)) / 2);
      this.s.text(tx, y, t, opts.titleFg || C.hi, opts.titleBg || bg);
    }
  }

  // horizontal divider inside a box
  divider(x, y, w, opts = {}) {
    const st = BOX[opts.style || 'single'];
    const fg = opts.fg || C.fg;
    this.s.set(x, y, st.lt, fg);
    this.s.set(x + w - 1, y, st.rt, fg);
    for (let i = 1; i < w - 1; i++) this.s.set(x + i, y, st.h === '═' ? '─' : st.h, fg);
  }

  // Turbo-Vision style drop shadow
  shadow(x, y, w, h) {
    this.s.paint(x + w, y + 1, 2, h, C.dim2, C.sh);
    this.s.paint(x + 2, y + h, w, 1, C.dim2, C.sh);
  }

  // [ label ] style inline button. returns width
  button(id, x, y, label, onClick, opts = {}) {
    const txt = opts.raw ? label : `[${label}]`;
    const w = strWidth(txt);
    const hov = this.hit(id, x, y, w, 1, onClick, opts);
    let fg = opts.fg || C.cy;
    let bg = opts.bg;
    if (opts.active) {
      fg = C.ink;
      bg = C.cy;
    }
    if (opts.disabled) fg = C.dim2;
    if (hov) {
      fg = C.ink;
      bg = C.hi;
    }
    this.s.text(x, y, txt, fg, bg);
    return w;
  }

  // chunky push button with shadow (Turbo Vision style)
  pushButton(id, x, y, w, label, onClick, opts = {}) {
    const hov = this.hit(id, x, y, w + 1, 2, onClick, opts);
    const pressed = hov && this.down;
    let bg = opts.active ? C.cy : C.bg3;
    let fg = opts.active ? C.ink : C.hi;
    if (opts.danger) bg = opts.active ? C.yel : C.bg3;
    if (hov) {
      bg = C.hi;
      fg = C.ink;
    }
    if (opts.disabled) {
      bg = C.bg2;
      fg = C.dim2;
    }
    const ox = pressed ? 1 : 0;
    this.s.fill(x + ox, y, w, 1, ' ', fg, bg);
    this.s.text(x + ox, y, fit(label, w, 'center'), fg, bg);
    if (!pressed) {
      this.s.set(x + w, y, '▄', C.sh, null);
      this.s.fill(x + 1, y + 1, w, 1, '▀', C.sh, null);
    }
    return hov;
  }

  // checkbox-style toggle "[■] label"
  toggle(id, x, y, on, label, onClick, opts = {}) {
    const mark = on ? '■' : ' ';
    const txt = `[${mark}] ${label}`;
    const w = opts.width || strWidth(txt);
    const hov = this.hit(id, x, y, w, 1, onClick, opts);
    let fg = on ? C.hi : C.fg;
    let bg;
    if (hov) {
      fg = C.ink;
      bg = C.hi;
    }
    this.s.text(x, y, fit(txt, w), fg, bg);
    if (!hov) this.s.set(x + 1, y, mark, on ? C.cy : C.dim, null);
    return hov;
  }

  // horizontal meter with sub-cell resolution
  bar(x, y, w, v, opts = {}) {
    const fg = opts.fg || C.cy;
    const bg = opts.bg || C.bg2;
    const steps = ' ▏▎▍▌▋▊▉█';
    const f = Math.max(0, Math.min(1, v)) * w;
    for (let i = 0; i < w; i++) {
      const k = Math.max(0, Math.min(1, f - i));
      const ch = opts.blocky ? (k > 0.5 ? '█' : '░') : steps[Math.round(k * 8)];
      this.s.set(x + i, y, ch, ch === '░' ? C.dim2 : fg, bg);
    }
  }

  // segmented meter ▮▮▮▯▯
  segments(x, y, n, lit, fg = C.cy, off = C.dim2) {
    for (let i = 0; i < n; i++) this.s.set(x + i, y, '▮', i < lit ? fg : off);
  }

  // multi-line ascii art; ' ' cells are transparent unless opaque
  art(x, y, lines, fg = C.fg, bg) {
    lines.forEach((ln, j) => {
      let cx = x;
      for (const ch of ln) {
        if (ch !== ' ') this.s.text(cx, y + j, ch, fg, bg);
        cx += charWidth(ch);
      }
    });
  }

  // big 3x3 block digits, for clocks and counters
  bigText(x, y, str, fg = C.hi, bg) {
    let cx = x;
    for (const ch of str) {
      const g = BIG[ch] || BIG[' '];
      for (let j = 0; j < 3; j++) this.s.text(cx, y + j, g[j], fg, bg);
      cx += g[0].length + 1;
    }
    return cx - x;
  }
}

const BIG = {
  '0': ['█▀█', '█ █', '▀▀▀'],
  '1': ['▀█ ', ' █ ', '▀▀▀'],
  '2': ['▀▀█', '█▀▀', '▀▀▀'],
  '3': ['▀▀█', ' ▀█', '▀▀▀'],
  '4': ['█ █', '▀▀█', '  ▀'],
  '5': ['█▀▀', '▀▀█', '▀▀▀'],
  '6': ['█▀▀', '█▀█', '▀▀▀'],
  '7': ['▀▀█', '  █', '  ▀'],
  '8': ['█▀█', '█▀█', '▀▀▀'],
  '9': ['█▀█', '▀▀█', '▀▀▀'],
  ':': ['▄', '▄', ' '],
  ' ': [' ', ' ', ' '],
  '.': [' ', ' ', '▀'],
  '%': ['▀ ▄▀', ' ▄▀ ', '▀  ▀'],
};
