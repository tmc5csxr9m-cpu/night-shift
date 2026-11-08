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
    seen: { hints: [] },
  };
}

const MIGRATIONS = {
  // 1: (s) => s,   // v1 -> v2 goes here
};

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const int = (v, lo, hi, def) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : def);

// a save is only accepted with the right shape; anything off is repaired to
// a safe value, and a save that is not even an object falls back to the .bak
function parse(raw) {
  if (!raw) return null;
  try {
    let s = JSON.parse(raw);
    if (!isObj(s)) return null;
    while (s.version < VERSION && MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
    if (s.version !== VERSION) return null;
    if (!isObj(s.progress) || !isObj(s.nights)) return null;
    const f = fresh();
    const set = isObj(s.settings) ? s.settings : {};
    const d = f.settings;
    const settings = {
      masterVol: num(set.masterVol, 0, 1, d.masterVol), musicVol: num(set.musicVol, 0, 1, d.musicVol), sfxVol: num(set.sfxVol, 0, 1, d.sfxVol),
      brightness: num(set.brightness, 0.3, 2, d.brightness), crtIntensity: num(set.crtIntensity, 0.3, 1, d.crtIntensity),
      turnSpeed: num(set.turnSpeed, 0.3, 2, d.turnSpeed), reduceFlicker: !!set.reduceFlicker, debug: !!set.debug,
      display: ['fullscreen', '1280x720', '1600x900', '1920x1080'].includes(set.display) ? set.display : d.display,
    };
    const nights = {};
    for (let n = 1; n <= 6; n++) {
      const r = s.nights[n];
      if (!isObj(r)) continue;
      nights[n] = { cleared: !!r.cleared, attempts: int(r.attempts, 0, 1e6, 0), best: isObj(r.best) && Number.isFinite(r.best.powerLeft) ? { powerLeft: num(r.best.powerLeft, 0, 100, 0) } : null };
    }
    const maxNightCleared = int(s.progress.maxNightCleared, 0, 6, 0);
    const stats = isObj(s.stats) ? s.stats : {};
    return {
      version: VERSION,
      progress: { maxNightCleared, currentNight: int(s.progress.currentNight, 1, 6, Math.min(6, maxNightCleared + 1)) },
      nights,
      stats: {
        deaths: Object.fromEntries(Object.entries(isObj(stats.deaths) ? stats.deaths : {}).filter(([k, v]) => /^[a-z]{1,16}$/.test(k) && Number.isInteger(v) && v >= 0)),
        totalPlaySec: num(stats.totalPlaySec, 0, 1e9, 0),
      },
      settings,
      seen: { hints: Array.isArray(s.seen?.hints) ? s.seen.hints.filter((x) => typeof x === 'string') : [] },
    };
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
        // keep the good backup as it is: the broken main file must not overwrite it
        this.write({ keepBackup: true });
      } else if (files.main) this.warning = '存档损坏, 已重置.';
    }
    // the release build has no debug mode
    if (!DEBUG_ALLOWED) this.data.settings.debug = false;
    return this.data;
  },

  write({ keepBackup = false } = {}) {
    if (!native) return false;
    try {
      const ok = native.writeSave(JSON.stringify(this.data, null, 1), { keepBackup });
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
    const rec = (d.nights[night] = d.nights[night] || { cleared: false, attempts: 0, best: null });
    delete rec.stars;   // (star ratings were removed in v0.6)
    rec.attempts++;
    if (result.outcome === 'death') d.stats.deaths[result.cause] = (d.stats.deaths[result.cause] || 0) + 1;
    if (result.outcome === 'win') {
      rec.cleared = true;
      const powerLeft = world.powerPct();
      if (!rec.best || powerLeft > rec.best.powerLeft) rec.best = { powerLeft };
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
