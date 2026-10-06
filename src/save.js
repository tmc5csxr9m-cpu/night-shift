// Save data: one JSON file in the user's app-data folder, written atomically
// by the desktop shell (with a .bak of the previous save). Versioned
// migrations; a corrupt save falls back to the backup.
import { native, DEBUG_ALLOWED } from './native.js';

const VERSION = 1;

export const DEFAULT_SETTINGS = {
  masterVol: 0.9, musicVol: 0.8, sfxVol: 1.0, brightness: 1.0, crtIntensity: 1.0,
  turnSpeed: 1.0, reduceFlicker: false, display: 'fullscreen', debug: false,
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
  path: null,

  load() {
    if (!native) {
      this.warning = '未在桌面版中运行: 本次进度不会保存.';
      return this.data;
    }
    let files;
    try {
      files = native.readSave();
    } catch {
      this.warning = '无法读取存档: 本次进度可能不会保存.';
      return this.data;
    }
    this.path = files.path;
    const main = parse(files.main);
    if (main) this.data = main;
    else {
      const bak = parse(files.bak);
      if (bak) {
        this.data = bak;
        this.warning = '主存档损坏, 已从备份恢复.';
        this.write();
      } else if (files.main) this.warning = '存档损坏, 已重置.';
    }
    // the release build has no debug mode
    if (!DEBUG_ALLOWED) this.data.settings.debug = false;
    return this.data;
  },

  write() {
    if (!native) return false;
    try {
      const ok = native.writeSave(JSON.stringify(this.data, null, 1));
      if (!ok) this.warning = '存档写入失败 (磁盘已满或没有权限?)';
      return ok;
    } catch {
      this.warning = '存档写入失败.';
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
