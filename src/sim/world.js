// The night simulation. Deterministic: fixed 0.1s ticks, seeded RNG, all
// player input goes through cmd(). The browser game and the Node balance
// tools run exactly this code.
import { Rng } from './rng.js';
import { DEFAULT_PARAMS, mergeParams } from './params.js';
import { NIGHTS, CALL_LENGTH } from './nights.js';
import { sensorRoom, nodesInRoom, DOOR_NODES, NEAR_DOOR, NODE_SIDE } from './graph.js';
import { Sunny } from './actors/sunny.js';
import { Pip } from './actors/pip.js';
import { Tootie } from './actors/tootie.js';

const ACTORS = { sunny: Sunny, pip: Pip, tootie: Tootie };

export const ROOM_IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', 'OF'];
export const CIRCUITS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C0'];
export const ACTOR_NAMES = { sunny: '桑尼熊', pip: '皮普兔', tootie: '嘟嘟鸟', power: '断电' };

// tonight's brand-new threats are held back while the tutorial call plays
const NEW_TONIGHT = { 1: ['sunny'], 2: ['pip'] };

const BREAKER_NOTES = {
  C9: ['舞台电路断开. 台上的表演者切换为内置电池.', '舞台电路恢复.'],
  C0: ['冷库断电!', '冷库供电恢复.'],
  C6: ['传感网络离线. 地图读数与扫描不可用.', '传感网络重新上线.'],
  C7: ['广播回路断开 — 音乐盒停止!', '广播回路恢复.'],
};

export class World {
  constructor({ night = 1, seed = 1, params, debug } = {}) {
    this.P = mergeParams(DEFAULT_PARAMS, params);
    this.nightIndex = night;
    this.night = mergeParams(NIGHTS[night], params?.nights?.[night]);
    this.seed = seed;
    this.rng = new Rng(seed);
    this.t = 0;
    this.tickN = 0;
    this.result = null;
    this.overtime = false;
    this.events = [];          // drained by the client each frame
    this.timeline = [];        // debug history
    this.commands = [];        // replay log
    this.listeners = [];
    this.logLines = [];
    this.callGate = CALL_LENGTH[night] || 0;
    this.debug = { god: false, infinitePower: false, freeze: false, noEvents: false, disabled: {}, ...debug };

    const n = this.night;
    this.power = { reserve: n.reserve, max: n.reserve, load: 0, parts: {}, tripped: false, blackoutT: 0, out: false, outT: 0 };
    this.circuits = {};
    for (const c of CIRCUITS) this.circuits[c] = true;
    this.office = { light: 2, fan: true, oscillate: true, vent: 0, maglock: false, coil: 0, coilLockout: 0 };
    this.doors = {
      L: { on: false, heat: 0, broken: false, stuckT: 0 },
      R: { on: false, heat: 0, broken: false, stuckT: 0 },
    };
    this.spares = n.spares;
    this.temp = { out: n.outside, room: n.outside + 1.5, eff: 0, rebootT: 0 };
    this.noise = { db: 30, parts: {}, degaussT: 0 };
    this.emi = { L: 0, R: 0, B: 0, T: 0, magnet: 0, cooldown: 0 };
    this.musicBox = { wind: 1, auto: n.autoWind };
    this.phone = { state: 'idle', t: 0, kind: null };
    this.player = { look: 'F', focused: false, page: null };
    this.calibrated = { sensors: false, lure: !n.lureNeedsT02, radio: false, relays: false };
    this.tasks = n.tasks.map((id) => ({ id, done: false, doneAt: null }));
    this.emergencies = [];
    this.lureCooldown = 0;
    this.eventT = this.P.events.meanGap * (0.6 + this.rng.float());
    this.stats = { repels: {}, burned: 0, scans: 0, lures: 0, minPower: 100 };
    this.cues = [];            // recent sound cues (debug / bots)

    this.rooms = {};
    for (const id of ROOM_IDS) {
      this.rooms[id] = { light: false, sealed: false, sealT: 0, sealCd: 0, noise: 26 + this.rng.float() * 6, spike: 0, drift: 0, scanT: 0, scanCd: 0, result: null, hist: [] };
    }
    this.actors = n.actors.map((id) => new ACTORS[id](this));
    this.phone.state = n.call ? 'pending' : 'idle';
    this.computeLoad();
  }

  // ------------------------------------------------------------ helpers
  get hour() {
    return Math.min(5, Math.floor(this.t / this.P.hourSeconds));
  }

  get gameMinutes() {
    return Math.min(360 + (this.overtime ? 30 : 0), (this.t / this.P.nightSeconds) * 360);
  }

  clock() {
    const m = Math.floor(this.gameMinutes);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  isNewTonight(id) {
    return (NEW_TONIGHT[this.nightIndex] || []).includes(id);
  }

  actor(id) {
    return this.actors.find((a) => a.id === id);
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(type, data = {}) {
    const ev = { type, t: this.t, ...data };
    this.events.push(ev);
    if (type !== 'cue') {
      this.timeline.push(ev);
      if (this.timeline.length > 400) this.timeline.shift();
    }
    for (const fn of this.listeners) fn(ev);
  }

  log(msg, level = 'info') {
    const line = { t: this.clock(), msg, level };
    this.logLines.push(line);
    if (this.logLines.length > 80) this.logLines.shift();
    this.emit('log', line);
  }

  // a system is live if the main breaker is in, there is power, and its circuit is closed
  powered(c) {
    if (this.power.out || this.power.tripped) return false;
    return c ? this.circuits[c] : true;
  }

  doorWorking(side) {
    const d = this.doors[side];
    return !d.broken && d.stuckT <= 0 && this.powered(side === 'L' ? 'C2' : 'C3');
  }

  doorLit(side) {
    return this.doors[side].on && this.doorWorking(side);
  }

  musicPlaying() {
    return this.powered('C7') && this.musicBox.wind > 0;
  }

  noiseBonus() {
    const n = this.P.noise;
    return Math.min(n.pipMax, Math.max(0, Math.floor((this.noise.db - n.base) / n.pipPerDb)));
  }

  // probability the player hears a cue of `db` given office noise
  hearP(db) {
    const h = this.P.hearing;
    return 1 / (1 + Math.exp(-(db - this.noise.db - h.offset) / h.slope));
  }

  // ------------------------------------------------------------ actor hooks
  trace(actor, roll, a) {
    actor.lastRoll = roll;
    actor.lastA = a;
  }

  cue(source, node, db, kind = 'step') {
    const side = NODE_SIDE[node] || 'F';
    const c = { source, node, side, db, kind, p: this.hearP(db), t: this.t };
    this.cues.push(c);
    if (this.cues.length > 30) this.cues.shift();
    this.emit('cue', c);
  }

  onMove(actor, from, to) {
    const room = sensorRoom(to);
    if (room && this.rooms[room]) this.rooms[room].spike = Math.max(this.rooms[room].spike, 14 + this.rng.float() * 8);
    const db = this.P.cues[actor.id]?.[to];
    if (db) this.cue(actor.id, to, db, 'step');
    this.emit('move', { actor: actor.id, from, to });
  }

  onDoor(actor, side) {
    actor.doorCueT = this.P.doorCueEvery;
    actor.doorCues = 0;
    this.cue(actor.id, actor.node, (this.P.cues[actor.id]?.[actor.node] || 48) + 2, 'greet');
    this.emit('door', { actor: actor.id, side });
  }

  // called by tick for actors standing at a door
  doorNag(actor, dt) {
    actor.doorCueT -= dt;
    if (actor.doorCueT > 0) return;
    actor.doorCueT = this.P.doorCueEvery;
    actor.doorCues++;
    this.cue(actor.id, actor.node, (this.P.cues[actor.id]?.[actor.node] || 48) + 2 + actor.doorCues * 2, 'greet');
  }

  onRepel(actor, side) {
    this.stats.repels[actor.id] = (this.stats.repels[actor.id] || 0) + 1;
    this.emit('repel', { actor: actor.id, side });
  }

  telegraph(actor, kind, side) {
    this.emit('telegraph', { actor: actor.id, kind, side });
  }

  kill(actor) {
    const cause = actor.id || actor;
    if (this.debug.god) {
      this.log(`[DEBUG] 无敌: ${ACTOR_NAMES[cause] || cause} 的攻击被忽略`, 'warn');
      if (actor.node) {
        actor.state = actor.id === 'tootie' ? 'return' : 'idle';
        actor.moveTo(actor.start);
        if (actor.id === 'tootie') actor.state = 'dormant';
      }
      return;
    }
    if (this.result) return;
    this.result = { outcome: 'death', cause, t: this.t, clock: this.clock() };
    this.emit('death', { cause, side: actor.node ? DOOR_NODES[actor.node] : null });
  }

  // ------------------------------------------------------------ commands
  cmd(name, args = {}) {
    if (this.result) return { ok: false, msg: 'ended' };
    const fn = this['c_' + name];
    if (!fn) return { ok: false, msg: 'unknown ' + name };
    this.commands.push({ tick: this.tickN, name, args });
    const r = fn.call(this, args) || { ok: true };
    this.emit('cmd', { name, args, ok: r.ok });
    return r;
  }

  c_look({ dir }) {
    this.player.look = dir;
  }

  c_focus({ on, page }) {
    this.player.focused = !!on;
    if (page !== undefined) this.player.page = page;
  }

  c_page({ page }) {
    this.player.page = page;
  }

  c_doorLight({ side, on }) {
    const d = this.doors[side];
    const want = on === undefined ? !d.on : !!on;
    if (want && !this.doorWorking(side)) {
      d.on = false;
      return { ok: false, msg: d.broken ? '灯管已烧坏' : d.stuckT > 0 ? '继电器卡死' : '无供电' };
    }
    d.on = want;
    this.emit('doorLight', { side, on: want });
  }

  c_officeLight({ level }) {
    this.office.light = level;
  }

  c_fan({ on }) {
    this.office.fan = on === undefined ? !this.office.fan : !!on;
  }

  c_oscillate({ on }) {
    this.office.oscillate = on === undefined ? !this.office.oscillate : !!on;
  }

  c_vent({ level }) {
    this.office.vent = Math.max(0, Math.min(3, level));
  }

  c_breaker({ id, on }) {
    const was = this.circuits[id];
    this.circuits[id] = on === undefined ? !was : !!on;
    if (was !== this.circuits[id]) {
      const note = BREAKER_NOTES[id];
      const now = this.circuits[id];
      this.log(note ? note[now ? 1 : 0] : `回路 ${id} ${now ? '闭合' : '断开'}.`, now ? 'info' : 'warn');
    }
    this.emit('breaker', { id, on: this.circuits[id] });
  }

  c_resetMain() {
    if (!this.power.tripped) return { ok: false };
    if (this.power.blackoutT > 0) return { ok: false, msg: '主闸冷却中' };
    this.power.tripped = false;
    this.resolveEmergency('E-4');
    this.log('主闸已复位.');
    this.emit('reset');
  }

  c_scan({ room }) {
    const r = this.rooms[room];
    if (!r || room === 'OF') return { ok: false };
    if (!this.powered('C6')) return { ok: false, msg: '传感网络离线' };
    if (r.scanT > 0 || r.scanCd > 0) return { ok: false, msg: '扫描冷却中' };
    r.scanT = this.P.scan.time;
    r.result = null;
    this.drain(this.P.power.scanCost);
    this.stats.scans++;
    this.emit('scan', { room });
  }

  c_lure({ room }) {
    if (!this.powered('C7')) return { ok: false, msg: '广播回路无供电' };
    if (!this.calibrated.lure) return { ok: false, msg: '分区放音模块故障 (T-02)' };
    if (this.lureCooldown > 0) return { ok: false, msg: '放音模块忙' };
    if (!this.rooms[room] || room === 'OF') return { ok: false };
    this.lureCooldown = 3;
    this.stats.lures++;
    this.rooms[room].spike = 40;
    this.emit('lure', { room });
    for (const a of this.actors) if (a.onLure) a.onLure(room);
  }

  c_roomLight({ room, on }) {
    const r = this.rooms[room];
    if (!r || room === 'OF') return { ok: false };
    r.light = on === undefined ? !r.light : !!on;
  }

  c_seal({ room, on }) {
    const r = this.rooms[room];
    if (!r || room === 'OF') return { ok: false };
    const want = on === undefined ? !r.sealed : !!on;
    if (want) {
      if (!this.powered('C6')) return { ok: false, msg: '传感网络离线' };
      if (r.sealCd > 0) return { ok: false, msg: '卷帘复位中' };
      r.sealed = true;
      r.sealT = this.P.seal.maxTime;
    } else if (r.sealed) {
      r.sealed = false;
      r.sealCd = this.P.seal.cooldown;
    }
    this.emit('seal', { room, on: r.sealed });
  }

  c_maglock({ on }) {
    const o = this.office;
    const want = on === undefined ? !o.maglock : !!on;
    if (want && (o.coilLockout > 0 || !this.powered('C8'))) return { ok: false, msg: o.coilLockout > 0 ? '线圈过热' : '无供电' };
    o.maglock = want;
  }

  c_wind({ dt }) {
    if (!this.powered('C7')) return { ok: false, msg: '无供电' };
    this.musicBox.wind = Math.min(1, this.musicBox.wind + this.P.musicBox.windRate * Math.min(dt, 0.5));
  }

  c_degauss() {
    if (this.emi.cooldown > 0) return { ok: false, msg: '消磁线圈冷却中' };
    this.emi.magnet = 0;
    this.emi.cooldown = this.P.emi.degaussCooldown;
    this.noise.degaussT = this.P.noise.degaussTime;
    this.emit('degauss');
  }

  c_answerPhone() {
    if (this.phone.state === 'ringing') this.startCall();
  }

  c_hangUp() {
    if (this.phone.state === 'ringing' || this.phone.state === 'call') {
      this.phone.state = 'idle';
      this.emit('phone', { state: 'idle' });
    }
  }

  c_taskComplete({ id }) {
    const task = this.tasks.find((x) => x.id === id);
    if (!task || task.done) return { ok: false };
    task.done = true;
    task.doneAt = this.t;
    if (id === 'T-01') {
      this.calibrated.sensors = true;
      for (const r of Object.values(this.rooms)) r.drift = 0;
    }
    if (id === 'T-02') this.calibrated.lure = true;
    if (id === 'T-03') this.calibrated.radio = true;
    if (id === 'T-04') {
      this.calibrated.relays = true;
      for (const d of Object.values(this.doors)) d.stuckT = 0;
    }
    this.emit('task', { id });
    if (this.overtime && this.tasks.every((x) => x.done)) this.finish('win');
  }

  c_replaceBulb({ side }) {
    const d = this.doors[side];
    if (!d.broken) return { ok: false };
    if (this.spares <= 0) return { ok: false, msg: '没有备用灯管' };
    this.spares--;
    d.broken = false;
    d.heat = 0;
    this.resolveEmergency('E-1', side);
    this.log(`${side === 'L' ? '左' : '右'}门灯管已更换 (剩余 ${this.spares}).`);
    this.emit('bulbReplaced', { side });
  }

  // ------------------------------------------------------------ debug API
  dbg(name, args = {}) {
    switch (name) {
      case 'teleport': {
        const a = this.actor(args.id);
        if (!a) return;
        a.moveTo(args.node);
        a.state = 'idle';
        if (args.node.startsWith('DOOR') || args.node === 'VENT') {
          a.state = 'door';
          a.attackT = a.id === 'sunny' ? 8 : a.p.attackDelay || 6;
          this.onDoor(a, DOOR_NODES[args.node]);
        }
        break;
      }
      case 'completeTask':
        this.c_taskComplete({ id: args.id });
        break;
      case 'refill':
        this.power.reserve = this.power.max;
        this.spares = 3;
        this.musicBox.wind = 1;
        break;
      case 'event':
        this.randomEvent(args.kind);
        break;
      case 'setTime':
        this.t = args.t;
        break;
      default:
    }
    this.emit('debug', { name, args });
  }

  // ------------------------------------------------------------ tick
  tick() {
    if (this.result) return;
    const dt = this.P.tick;
    this.t += dt;
    this.tickN++;

    this.tickPhone(dt);
    this.tickPower(dt);
    this.tickDoors(dt);
    this.tickMusic(dt);
    this.tickOffice(dt);
    this.tickTemp(dt);
    this.tickNoise(dt);
    this.tickRooms(dt);
    if (!this.debug.freeze) {
      for (const a of this.actors) {
        if (this.debug.disabled[a.id]) continue;
        a.tick(dt);
        if (a.state === 'door' && !this.result) this.doorNag(a, dt);
      }
    }
    this.tickEmi(dt);
    this.tickEvents(dt);
    this.tickClock();
    this.stats.minPower = Math.min(this.stats.minPower, this.powerPct());
  }

  powerPct() {
    return (this.power.reserve / this.power.max) * 100;
  }

  tickClock() {
    const P = this.P;
    const h = Math.floor(this.t / P.hourSeconds);
    if (h !== this.lastHour) {
      if (this.lastHour !== undefined && h <= 5) this.emit('hour', { hour: h });
      this.lastHour = h;
    }
    if (!this.overtime && this.t >= P.nightSeconds) {
      if (this.tasks.every((x) => x.done)) this.finish('win');
      else {
        this.overtime = true;
        this.log('交班清单未完成 — 进入加班!', 'warn');
        this.emit('overtime');
      }
    }
    if (this.overtime && this.t >= P.nightSeconds + P.overtimeSeconds) this.finish('fired');
  }

  finish(outcome) {
    if (this.result) return;
    this.result = { outcome, t: this.t, clock: this.clock(), overtime: this.overtime };
    this.emit(outcome);
  }

  tickPhone(dt) {
    const ph = this.phone;
    if (ph.state === 'pending' && this.t >= 3) {
      ph.state = 'ringing';
      ph.t = 0;
      ph.kind = 'tutorial';
      this.emit('phone', { state: 'ringing' });
    } else if (ph.state === 'ringing') {
      ph.t += dt;
      if (ph.t >= this.P.call.ringTime) {
        if (ph.kind === 'tutorial') this.startCall();
        else {
          ph.state = 'idle';
          this.emit('phone', { state: 'idle' });
        }
      }
    } else if (ph.state === 'call') {
      ph.t += dt;
      if (ph.t >= (CALL_LENGTH[this.nightIndex] || 0)) {
        ph.state = 'idle';
        this.emit('phone', { state: 'idle' });
      }
    }
  }

  startCall() {
    this.phone.state = 'call';
    this.phone.t = 0;
    this.emit('phone', { state: 'call', night: this.nightIndex });
  }

  computeLoad() {
    const P = this.P.power;
    const parts = {};
    if (!this.power.out && !this.power.tripped) {
      const on = (c) => this.circuits[c];
      parts.base = P.base;
      if (on('C6')) parts.sensors = P.C6;
      if (on('C7')) parts.pa = this.musicBox.wind > 0 ? P.C7play : P.C7idle;
      if (on('C8') && this.office.maglock) parts.maglock = P.C8;
      if (on('C9')) parts.stage = P.C9;
      if (on('C0')) parts.freezer = P.C0;
      if (on('C1') && this.office.light) parts.officeLight = P.officeLight[this.office.light];
      if (this.doorLit('L')) parts.doorL = P.doorLight;
      if (this.doorLit('R')) parts.doorR = P.doorLight;
      if (on('C4') && this.office.vent) parts.vent = P.vent * this.office.vent;
      if (on('C5') && this.office.fan) parts.fan = P.fan;
      let lights = 0;
      let seals = 0;
      for (const r of Object.values(this.rooms)) {
        if (r.light) lights++;
        if (r.sealed) seals++;
      }
      if (lights) parts.roomLights = lights * P.roomLight;
      if (seals) parts.seals = seals * P.seal;
    }
    let total = 0;
    for (const k in parts) total += parts[k];
    this.power.parts = parts;
    this.power.load = total;
    return total;
  }

  drain(kwMin) {
    if (this.debug.infinitePower) return;
    this.power.reserve = Math.max(0, this.power.reserve - kwMin);
  }

  tickPower(dt) {
    const pw = this.power;
    const load = this.computeLoad();
    if (!pw.tripped && !pw.out && load > this.P.power.tripLimit) {
      pw.tripped = true;
      pw.blackoutT = this.P.power.tripBlackout;
      for (const d of Object.values(this.doors)) d.on = false;
      this.office.maglock = false;
      this.log(`主闸跳闸! 负载 ${load.toFixed(1)}kW 超过上限.`, 'err');
      this.addEmergency('E-4');
      this.emit('trip');
    }
    if (pw.blackoutT > 0) pw.blackoutT -= dt;
    this.drain((load * dt) / 60);
    if (!pw.out && pw.reserve <= 0) {
      pw.out = true;
      pw.outT = 6 + this.rng.float() * 10;
      for (const d of Object.values(this.doors)) d.on = false;
      this.office.maglock = false;
      for (const r of Object.values(this.rooms)) {
        r.light = false;
        r.sealed = false;
      }
      this.log('电力耗尽.', 'err');
      this.emit('powerOut');
    }
    if (pw.out) {
      pw.outT -= dt;
      if (pw.outT <= 0) this.kill('power');
    }
  }

  tickDoors(dt) {
    const P = this.P.doorLight;
    for (const side of ['L', 'R']) {
      const d = this.doors[side];
      if (d.stuckT > 0) {
        d.stuckT -= dt;
        if (d.stuckT <= 0) this.log(`${side === 'L' ? '左' : '右'}门灯继电器恢复.`);
      }
      if (d.on && !this.doorWorking(side)) d.on = false;
      if (this.doorLit(side)) d.heat += P.heatOn * dt;
      else d.heat = Math.max(0, d.heat - P.coolOff * dt * (this.calibrated.relays ? P.coolBonusRelays : 1));
      if (d.heat >= 100) {
        if (this.night.bulbsBurn) {
          d.heat = 100;
          d.broken = true;
          d.on = false;
          this.stats.burned++;
          this.log(`${side === 'L' ? '左' : '右'}门灯管烧坏!`, 'err');
          this.addEmergency('E-1', side);
          this.emit('bulbBurn', { side });
        } else d.heat = 99;
      }
    }
  }

  tickMusic(dt) {
    const mb = this.musicBox;
    if (mb.auto) {
      if (this.powered('C7')) mb.wind = 1;
    } else if (this.musicPlaying()) {
      mb.wind = Math.max(0, mb.wind - (this.night.windDrain || 0.01) * dt);
    }
  }

  tickOffice(dt) {
    const o = this.office;
    const M = this.P.maglock;
    if (o.maglock && !this.powered('C8')) o.maglock = false;
    if (o.coilLockout > 0) o.coilLockout -= dt;
    if (o.maglock) {
      o.coil += dt;
      if (o.coil >= M.maxLock) {
        o.maglock = false;
        o.coilLockout = M.lockout;
        this.log('磁锁线圈过热, 强制解锁!', 'err');
        this.emit('coilOverheat');
      }
    } else o.coil = Math.max(0, o.coil - dt * (M.maxLock / M.lockout));
  }

  tickTemp(dt) {
    const T = this.P.temp;
    const tp = this.temp;
    const light = this.powered('C1') ? this.office.light : 0;
    const vent = this.powered('C4') ? this.office.vent : 0;
    let target = tp.out + T.equipment + T.lightPerLevel * light;
    target -= Math.max(0, target - tp.out) * Math.min(0.9, T.ventK * vent);
    tp.room += (target - tp.room) * (dt / T.tau);
    tp.eff = tp.room - (this.powered('C5') && this.office.fan ? T.fan : 0);
    if (tp.rebootT > 0) tp.rebootT -= dt;
    else if (tp.eff >= T.shutdown) {
      tp.rebootT = T.rebootTime;
      this.log('终端过热保护, 正在重启...', 'err');
      this.emit('crtReboot');
    }
  }

  tickNoise(dt) {
    const N = this.P.noise;
    const parts = { base: N.base };
    const o = this.office;
    if (this.powered('C5') && o.fan) parts.fan = N.fan;
    if (this.powered('C4') && o.vent) parts.vent = N.base + N.ventPerLevel * o.vent;
    if (this.phone.state === 'ringing') parts.phone = N.phone;
    if (this.noise.degaussT > 0) {
      parts.degauss = N.degauss;
      this.noise.degaussT -= dt;
    }
    if (this.musicPlaying()) parts.musicBox = N.musicBox;
    let e = 0;
    for (const k in parts) e += Math.pow(10, parts[k] / 10);
    this.noise.db = 10 * Math.log10(e);
    this.noise.parts = parts;
  }

  tickRooms(dt) {
    const S = this.P.scan;
    for (const id of ROOM_IDS) {
      const r = this.rooms[id];
      r.spike = Math.max(0, r.spike - dt * 6);
      const target = 28 + r.spike + r.drift;
      r.noise += (target - r.noise) * dt * 0.9 + (this.rng.float() - 0.5) * 5 * dt;
      r.histT = (r.histT || 0) + dt;
      if (r.histT >= 0.5) {
        r.histT = 0;
        r.hist.push(r.noise);
        if (r.hist.length > 16) r.hist.shift();
      }
      if (r.sealed) {
        r.sealT -= dt;
        if (r.sealT <= 0 || !this.powered('C6')) {
          r.sealed = false;
          r.sealCd = this.P.seal.cooldown;
          this.emit('seal', { room: id, on: false, auto: true });
        }
      } else if (r.sealCd > 0) r.sealCd -= dt;
      if (r.scanCd > 0) r.scanCd -= dt;
      if (r.scanT > 0) {
        r.scanT -= dt;
        if (!this.powered('C6')) {
          r.scanT = 0;
          continue;
        }
        if (r.scanT <= 0) {
          r.scanCd = S.cooldown;
          r.result = this.scanResult(id);
          this.emit('scanDone', { room: id, result: r.result });
          this.log(`扫描 ${id}: ${r.result.text}`, r.result.count ? 'warn' : 'info');
        }
      }
    }
    if (this.lureCooldown > 0) this.lureCooldown -= dt;
  }

  scanResult(room) {
    const nodes = nodesInRoom(room);
    const real = this.actors.filter((a) => nodes.includes(a.node) && (a.id !== 'tootie' || room === '13')).length;
    const acc = this.calibrated.sensors ? this.P.scan.accuracyCalibrated : this.P.scan.accuracy;
    let count = real;
    let falsePos = false;
    if (!this.rng.chance(acc)) {
      if (real > 0) count = real - 1;
      else {
        count = 1;
        falsePos = true;
      }
    }
    let text;
    if (count === 0) text = '未检测到运动';
    else if (room === '01' || room === '13') text = `${count} 个静止目标`;
    else text = `检测到 ${count} 个移动目标`;
    if (room === '01' && count < 2) text += ` · ${2 - count} 个空点位`;
    return { count, text, real, falsePos };
  }

  tickEmi(dt) {
    const E = this.P.emi;
    const em = this.emi;
    const s = { L: 0, R: 0, B: 0, T: 0 };
    for (const a of this.actors) {
      // motors draw unevenly: interference pulses instead of a steady signal
      const k = (E.strength[a.id] ?? 1) * (1 - E.pulse * (0.5 + 0.5 * Math.sin(this.t * (2.1 + a.id.length * 0.37) + a.id.length)));
      const door = DOOR_NODES[a.node];
      if (door) s[door] = Math.max(s[door], E.door * k);
      const near = NEAR_DOOR[a.node];
      if (near) s[near] = Math.max(s[near], E.adjacent * k);
    }
    // smooth so it ramps visibly
    for (const k of ['L', 'R', 'B', 'T']) em[k] += (s[k] - em[k]) * Math.min(1, dt * 3);
    em.magnet = Math.min(1, em.magnet + (s.L + s.R + s.B + s.T) * E.magnetRate * dt);
    if (em.cooldown > 0) em.cooldown -= dt;
  }

  addEmergency(id, side) {
    if (this.emergencies.some((e) => e.id === id && e.side === side)) return;
    this.emergencies.push({ id, side, t: this.t });
    this.emit('emergency', { id, side });
  }

  resolveEmergency(id, side) {
    this.emergencies = this.emergencies.filter((e) => !(e.id === id && (side === undefined || e.side === side)));
  }

  tickEvents(dt) {
    if (!this.night.events || this.debug.noEvents) return;
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = this.P.events.meanGap * (0.5 + this.rng.float());
    this.randomEvent();
  }

  randomEvent(kind) {
    const kinds = ['relayStuck', 'drift', 'aging'];
    kind = kind || this.rng.pick(kinds);
    if (kind === 'relayStuck') {
      if (this.calibrated.relays) return;
      const side = this.rng.chance(0.5) ? 'L' : 'R';
      // never strand the player: only when nothing is close to that door
      const close = side === 'L' ? ['07N', 'DOOR_L'] : ['08N', 'DOOR_R'];
      if (this.actors.some((a) => close.includes(a.node))) return;
      this.doors[side].stuckT = this.P.doorLight.stuckTime;
      this.doors[side].on = false;
      this.log(`${side === 'L' ? '左' : '右'}门灯继电器卡死 (约 10 秒).`, 'warn');
      this.emit('relayStuck', { side });
    } else if (kind === 'drift') {
      if (this.calibrated.sensors) return;
      const room = this.rng.pick(['02', '03', '06', '07', '08', '11']);
      this.rooms[room].drift = 14;
      this.log(`节点 ${room} 读数漂移 (需要校准 T-01).`, 'warn');
    } else if (kind === 'aging') {
      const c = this.rng.pick(['C1', 'C4', 'C5', 'C6']);
      if (!this.circuits[c]) return;
      this.circuits[c] = false;
      this.log(`回路 ${c} 老化跳闸.`, 'warn');
      this.emit('breaker', { id: c, on: false, auto: true });
    }
  }
}
