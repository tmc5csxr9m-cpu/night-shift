// Save data in localStorage with a backup copy and versioned migrations.
const KEY = 'nightshift.save.v1';
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  masterVol: 0.9, musicVol: 0.8, sfxVol: 1.0, brightness: 1.0, crtIntensity: 1.0,
  turnSpeed: 1.0, audioCaptions: false, reduceFlicker: false, contextHints: true, debug: false,
};

function fresh() {
  return {
    version: VERSION,
    progress: { currentNight: 1, maxNightCleared: 0 },
    nights: {},
    stats: { deaths: {}, totalPlaySec: 0 },
    settings: { ...DEFAULT_SETTINGS },
    seen: { calls: [], hints: [] },
  };
}

const MIGRATIONS = {
  // 1: (s) => s,   // v1 -> v2 goes here
};

let storageOk = true;
function store() {
  try {
    const t = '__ns_test';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    storageOk = false;
    return null;
  }
}

function parse(raw) {
  if (!raw) return null;
  try {
    let s = JSON.parse(raw);
    while (s.version < VERSION && MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
    if (s.version !== VERSION) return null;
    const f = fresh();
    return { ...f, ...s, settings: { ...f.settings, ...s.settings }, seen: { ...f.seen, ...s.seen }, progress: { ...f.progress, ...s.progress } };
  } catch {
    return null;
  }
}

export const save = {
  data: fresh(),
  warning: null,

  load() {
    const ls = store();
    if (!ls) {
      this.warning = '浏览器存储不可用: 本次进度不会保存.';
      return this.data;
    }
    const main = parse(ls.getItem(KEY));
    if (main) this.data = main;
    else {
      const bak = parse(ls.getItem(KEY + '.bak'));
      if (bak) {
        this.data = bak;
        this.warning = '主存档损坏, 已从备份恢复.';
      } else if (ls.getItem(KEY)) this.warning = '存档损坏, 已重置.';
    }
    return this.data;
  },

  write() {
    const ls = storageOk ? store() : null;
    if (!ls) return false;
    try {
      const prev = ls.getItem(KEY);
      if (prev) ls.setItem(KEY + '.bak', prev);
      const raw = JSON.stringify(this.data);
      ls.setItem(KEY, raw);
      return ls.getItem(KEY) === raw;
    } catch {
      return false;
    }
  },

  reset() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings;
    this.write();
  },

  setting(k, v) {
    this.data.settings[k] = v;
    this.write();
  },

  // record a finished night (never called for debug runs)
  recordNight(night, result, world) {
    const d = this.data;
    const rec = (d.nights[night] = d.nights[night] || { cleared: false, attempts: 0, stars: 0, best: null });
    rec.attempts++;
    if (result.outcome === 'death') d.stats.deaths[result.cause] = (d.stats.deaths[result.cause] || 0) + 1;
    if (result.outcome === 'win') {
      rec.cleared = true;
      const powerLeft = world.powerPct();
      let stars = 1;
      if (!result.overtime) stars++;
      if (powerLeft >= 15 && world.stats.burned === 0) stars++;
      rec.stars = Math.max(rec.stars, stars);
      if (!rec.best || powerLeft > rec.best.powerLeft) rec.best = { powerLeft, overtime: !!result.overtime };
      d.progress.maxNightCleared = Math.max(d.progress.maxNightCleared, night);
      d.progress.currentNight = Math.min(6, Math.max(d.progress.currentNight, night + 1));
    }
    this.write();
    return rec;
  },

  exportCode() {
    const raw = JSON.stringify(this.data);
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum = (sum * 31 + raw.charCodeAt(i)) >>> 0;
    return btoa(unescape(encodeURIComponent(raw))) + '.' + sum.toString(36);
  },

  importCode(code) {
    const [b, sum] = code.trim().split('.');
    const raw = decodeURIComponent(escape(atob(b)));
    let s = 0;
    for (let i = 0; i < raw.length; i++) s = (s * 31 + raw.charCodeAt(i)) >>> 0;
    if (s.toString(36) !== sum) throw new Error('校验失败');
    const parsed = parse(raw);
    if (!parsed) throw new Error('格式不正确');
    this.data = parsed;
    this.write();
  },
};
