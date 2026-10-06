// Text-mode screen: an 80x30 cell grid rendered with GNU Unifont onto a
// canvas that is used as the CRT texture. CJK glyphs take two cells, like
// the old Chinese DOS systems did.

export const COLS = 80;
export const ROWS = 30;
export const CW = 8;          // native cell size (VGA 8x16)
export const CH = 16;
export const SCALE = 2;       // canvas is rendered at 2x for a crisper texture

export const C = {
  bg: '#0d1b8c',      // main blue
  bg2: '#07105e',     // darker panels / wells
  bg3: '#2440c8',     // raised / hover
  fg: '#c3d1ff',      // normal blue-white text
  hi: '#ffffff',
  dim: '#6b7fd6',
  dim2: '#4a60c4',
  cy: '#7fe3ff',      // cyan accent
  inv: '#c3d1ff',     // status bar bg
  ink: '#0a1470',     // dark text on light bg
  yel: '#ffe56b',
  red: '#ff5f5f',
  ok: '#8affd0',
  sh: '#030828',      // drop shadow
  black: '#000000',
};

const FONT = 'Unifont';
const widthCache = new Map();
let measureCtx = null;

export function charWidth(ch) {
  let w = widthCache.get(ch);
  if (w !== undefined) return w;
  const cp = ch.codePointAt(0);
  if (cp < 0x2000) w = 1;
  else if (
    (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
  ) w = 2;
  else {
    // symbols: ask the font itself (Unifont has some 16px wide symbols)
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = `${CH}px ${FONT}`;
    }
    w = measureCtx.measureText(ch).width > CW * 1.5 ? 2 : 1;
  }
  widthCache.set(ch, w);
  return w;
}

export function strWidth(s) {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

// pad / truncate a string to an exact cell width
export function fit(s, w, align = 'left') {
  let out = '';
  let cw = 0;
  for (const ch of s) {
    const k = charWidth(ch);
    if (cw + k > w) break;
    out += ch;
    cw += k;
  }
  // dev builds: remember every string that did not fit (UI text overflow check)
  if (import.meta.env?.DEV && cw < strWidth(s) && s.trim()) (globalThis.__clipped ||= new Set()).add(`${s} [${w}]`);
  const pad = w - cw;
  if (align === 'right') return ' '.repeat(pad) + out;
  if (align === 'center') return ' '.repeat(pad >> 1) + out + ' '.repeat(pad - (pad >> 1));
  return out + ' '.repeat(pad);
}

// in-game hour (may be fractional: 4.5 -> "04:30")
export function hhmm(h) {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// wrap text to a cell width; CJK breaks anywhere, but closing punctuation
// never starts a line (the character before it moves down with it)
const NO_START = '，。、；：！？）」』》,.;:!?)';
export function wrap(s, w) {
  const lines = [];
  let line = [];
  let cw = 0;
  for (const ch of s) {
    const k = charWidth(ch);
    if (cw + k > w) {
      let carry = [];
      if (NO_START.includes(ch) && line.length > 1) carry = [line.pop()];
      lines.push(line.join('').trimEnd());
      line = carry;
      cw = carry.reduce((a, c) => a + charWidth(c), 0);
      if (ch === ' ' && !line.length) continue;
    }
    line.push(ch);
    cw += k;
  }
  if (line.length) lines.push(line.join('').trimEnd());
  return lines;
}

const CONT = '\u0000'; // marks the right half of a wide glyph

export class Screen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = COLS * CW * SCALE;
    this.canvas.height = ROWS * CH * SCALE;
    this.ctx = this.canvas.getContext('2d');
    // offscreen frame, composited onto the visible canvas with phosphor decay
    this.frame = document.createElement('canvas');
    this.frame.width = this.canvas.width;
    this.frame.height = this.canvas.height;
    this.fctx = this.frame.getContext('2d');
    const n = COLS * ROWS;
    this.ch = new Array(n).fill(' ');
    this.fg = new Array(n).fill(C.fg);
    this.bg = new Array(n).fill(C.bg);
    this.baseline = 14;
    this.clip = null;
  }

  fontReady() {
    const m = this.fctx;
    m.font = `${CH * SCALE}px ${FONT}`;
    const tm = m.measureText('Mg');
    const a = tm.fontBoundingBoxAscent;
    const d = tm.fontBoundingBoxDescent;
    if (a && d) this.baseline = Math.round((CH * a) / (a + d));
  }

  clear(bg = C.bg, fg = C.fg) {
    this.ch.fill(' ');
    this.fg.fill(fg);
    this.bg.fill(bg);
  }

  inBounds(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const c = this.clip;
    if (c && (x < c.x || y < c.y || x >= c.x + c.w || y >= c.y + c.h)) return false;
    return true;
  }

  set(x, y, ch, fg, bg) {
    if (!this.inBounds(x, y)) return;
    const i = y * COLS + x;
    // overwriting half of a wide glyph: blank the other half
    if (this.ch[i] === CONT && x > 0) this.ch[i - 1] = ' ';
    if (ch !== undefined && ch !== null) {
      if (charWidth(this.ch[i]) === 2 && x + 1 < COLS && this.ch[i + 1] === CONT) this.ch[i + 1] = ' ';
      this.ch[i] = ch;
    }
    if (fg) this.fg[i] = fg;
    if (bg) this.bg[i] = bg;
  }

  // write a string; returns the number of cells used
  text(x, y, s, fg, bg) {
    let cx = x;
    for (const ch of String(s)) {
      const w = charWidth(ch);
      this.set(cx, y, ch, fg, bg);
      if (w === 2) this.set(cx + 1, y, CONT, fg, bg);
      cx += w;
    }
    return cx - x;
  }

  fill(x, y, w, h, ch = ' ', fg, bg) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch, fg, bg);
  }

  // recolour without changing characters
  paint(x, y, w, h, fg, bg) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, null, fg, bg);
  }

  invert(x, y, w = 1, h = 1) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.inBounds(i, j)) continue;
        const k = j * COLS + i;
        const f = this.fg[k];
        this.fg[k] = this.bg[k];
        this.bg[k] = f;
      }
    }
  }

  get(x, y) {
    const i = y * COLS + x;
    return { ch: this.ch[i], fg: this.fg[i], bg: this.bg[i] };
  }

  // reveal: rows >= reveal are drawn blank (line-by-line output animation)
  render(opts = {}) {
    const { revealFrom = 0, reveal = ROWS, persistence = 0.5, glitchRows = null } = opts;
    const g = this.fctx;
    const sw = CW * SCALE;
    const sh = CH * SCALE;
    g.textBaseline = 'alphabetic';
    g.font = `${CH * SCALE}px ${FONT}`;
    for (let y = 0; y < ROWS; y++) {
      const hidden = y >= revealFrom && y >= reveal;
      // background runs
      let x = 0;
      while (x < COLS) {
        const b = hidden ? C.bg : this.bg[y * COLS + x];
        let x2 = x + 1;
        while (x2 < COLS && (hidden ? C.bg : this.bg[y * COLS + x2]) === b) x2++;
        g.fillStyle = b;
        g.fillRect(x * sw, y * sh, (x2 - x) * sw, sh);
        x = x2;
      }
      if (hidden) continue;
      let off = 0;
      if (glitchRows && glitchRows[y]) off = glitchRows[y];
      for (let i = 0; i < COLS; i++) {
        const k = y * COLS + i;
        const ch = this.ch[k];
        if (ch === ' ' || ch === CONT) continue;
        g.fillStyle = this.fg[k];
        g.fillText(ch, i * sw + off * SCALE, y * sh + this.baseline * SCALE);
      }
    }
    // write head: blinking block at the line currently being printed
    if (reveal < ROWS && reveal >= revealFrom) {
      g.fillStyle = C.hi;
      g.fillRect(0, reveal * sh + sh * 0.8, sw, sh * 0.2);
    }
    // phosphor persistence: blend new frame over the previous one
    const v = this.ctx;
    v.globalAlpha = 1 - persistence;
    v.drawImage(this.frame, 0, 0);
    v.globalAlpha = 1;
  }
}
