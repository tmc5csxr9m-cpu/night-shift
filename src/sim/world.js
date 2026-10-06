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
import { Chef } from './actors/chef.js';
import { Back } from './actors/back.js';
import { Ribbon } from './actors/ribbon.js';
import { Starlight } from './actors/starlight.js';

const ACTORS = { sunny: Sunny, pip: Pip, tootie: Tootie, chef: Chef, back: Back, ribbon: Ribbon, starlight: Starlight };
const HOME_DOOR = { sunny: 'DOOR_L', pip: 'DOOR_R', back: 'DOOR_B', ribbon: 'VENT' };
// which terminal page a command lives on (for STARLIGHT's page locks)
const CMD_PAGES = {
  scan: 'map', lure: 'map', roomLight: 'map', seal: 'map', rebootNode: 'map',
  breaker: 'power', resetMain: 'power', lockBreaker: 'power', generator: 'power',
  officeLight: 'facility', fan: 'facility', vent: 'facility', wind: 'facility', replaceBulb: 'facility', oscillate: 'facility',
  taskComplete: 'tasks',
};

export const ROOM_IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', 'OF'];
export const CIRCUITS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C0'];
export const ACTOR_NAMES = { sunny: '桑尼熊', pip: '皮普兔', tootie: '嘟嘟鸟', chef: '高迪大厨', back: '后门之物', ribbon: '丝带', starlight: 'STARLIGHT', power: '断电' };

// tonight's brand-new threats are held back while the tutorial call plays
const NEW_TONIGHT = { 1: ['sunny', 'pip'], 3: ['back'], 5: ['ribbon'], 6: ['starlight'] };

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
    this.temp = { out: n.outside, room: n.outside + 1.5, eff: 0, rebootT: 0, fanCool: this.P.temp.fan };
    this.noise = { db: 30, parts: {}, degaussT: 0 };
    this.emi = { L: 0, R: 0, B: 0, T: 0, magnet: 0, cooldown: 0 };
    this.musicBox = { wind: 1, auto: n.autoWind };
    this.phone = { state: 'idle', t: 0, kind: null };
    this.player = { look: 'F', focused: false, page: null };
    // n.broken: which module T-02 has to repair tonight ('lure' | 'seal')
    this.calibrated = { sensors: false, lure: n.broken !== 'lure', seal: n.broken !== 'seal', radio: false, relays: false, winder: false };
    // tasks: 'T-01' or ['T-01', openHour]
    this.tasks = n.tasks.map((x) => {
      const [id, open] = Array.isArray(x) ? x : [x, 0];
      return { id, open, done: false, doneAt: null };
    });
    this.shutterCd = 0;
    this.compressor = { fault: false, t: 0 };
    this.generator = { running: false, fuel: n.genFuel ?? 1, gridDown: false };
    this.locks = {};          // breaker write-protection { id: {t, cd} }
    this.bossLoad = 0;
    this.pageLock = null;
    this.ventHijack = 0;
    this.paJam = 0;          // N6 P3: STARLIGHT holds the PA zone selector
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

  // an unlit office makes everything bolder
  officeDark() {
    return !this.powered('C1') || this.office.light === 0;
  }

  // hot terminal: misclicks, garbled rows, slower work
  faulty() {
    return this.temp.eff >= this.P.temp.fault;
  }

  generatorRunning() {
    return !!(this.generator && this.generator.running);
  }

  // a mistimed ignition: a huge bang in the power room
  c_backfire() {
    this.noise.backfireT = 1.5;
    const back = this.actor('back');
    if (back) back.timer = Math.min(back.timer, 0.5);
    this.log('发电机回火!', 'warn');
    this.cue('generator', '10', 52, 'bang');
  }

  breakerLocked(id) {
    return !!(this.locks[id] && this.locks[id].t > 0);
  }

  c_lockBreaker({ id }) {
    const l = this.locks[id];
    if (l && l.t > 0) return { ok: false, msg: '已锁定' };
    if (l && l.cd > 0) return { ok: false, msg: `写保护冷却 ${l.cd.toFixed(0)}s` };
    this.locks[id] = { t: this.P.boss.lockTime, cd: 0 };
    this.log(`回路 ${id} 写保护 ${this.P.boss.lockTime} 秒.`);
  }

  ventLevel() {
    return this.powered('C4') && this.ventHijack <= 0 ? this.office.vent : 0;
  }

  c_generator({ on }) {
    const g = this.generator;
    if (on) return { ok: false, msg: '需要完成点火程序 (T-06)' };
    if (!g.running) return { ok: false };
    g.running = false;
    this.restartGenTask();
    this.log('发电机已停机.');
    this.emit('generator', { running: false });
  }

  // starting the generator again needs the ignition sequence again
  restartGenTask() {
    const t6 = this.tasks.find((x) => x.id === 'T-06');
    if (t6) t6.done = false;
    else this.tasks.push({ id: 'T-06', open: 0, done: false, doneAt: null, optional: true });
  }

  tickBoss(dt) {
    for (const l of Object.values(this.locks)) {
      if (l.t > 0) {
        l.t -= dt;
        if (l.t <= 0) l.cd = this.P.boss.lockCooldown;
      } else if (l.cd > 0) l.cd -= dt;
    }
    if (this.pageLock && this.pageLock.t > 0) this.pageLock.t -= dt;
    if (this.ventHijack > 0) this.ventHijack -= dt;
    if (this.paJam > 0) this.paJam -= dt;
    // boss-forced attacks: appear at the door after the warning
    for (const a of this.actors) {
      if (!(a.forcedT > 0)) continue;
      a.forcedT -= dt;
      if (a.forcedT > 0) continue;
      const door = HOME_DOOR[a.id];
      if (!door || a.state === 'door') continue;
      a.lure = null;
      a.pendingLure = null;
      a.moveTo(door);
      a.state = 'door';
      const d = a.p.attackDelay;
      a.attackT = Array.isArray(d) ? d[Math.min(5, this.nightIndex - 1)] : d;
      a.litT = 0;
      a.lockT = 0;
      this.onDoor(a, DOOR_NODES[door]);
    }
  }

  tickGenerator(dt) {
    const n = this.night;
    const g = this.generator;
    if (n.gridFail !== undefined && !g.gridDown && this.t >= n.gridFail * this.P.hourSeconds) {
      g.gridDown = true;
      this.drain(n.gridPenalty || 0);
      this.log('雷击! 主电网故障 — 切换到蓄电池 (消耗加快). 可启动备用发电机 (T-06).', 'err');
      this.addEmergency('E-5');
      this.restartGenTask();
      this.emit('gridFail');
    }
    if (g.running) {
      g.fuel = Math.max(0, g.fuel - dt / this.P.generator.duration);
      this.emi.magnet = Math.min(1, this.emi.magnet + this.P.generator.magnet * dt);
      if (g.fuel <= 0) {
        g.running = false;
        this.log('发电机燃料耗尽.', 'warn');
        this.emit('generator', { running: false });
      }
    }
  }

  compressorFault() {
    return this.compressor.fault;
  }

  fixCompressor() {
    if (!this.compressor.fault) return;
    this.compressor.fault = false;
    this.resolveEmergency('E-3');
    const chef = this.actor('chef');
    if (chef && chef.node === '05') chef.thaw = Math.max(0, chef.thaw - 40);
    this.log('压缩机已重启, 冷库恢复制冷.');
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
  // doors: in a dark office the attack timer runs faster
  attackRate() {
    return this.officeDark() ? 1 / this.P.darkAttack : 1;
  }

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
    const side = actor.node ? DOOR_NODES[actor.node] : null;
    this.result = { outcome: 'death', cause, side, t: this.t, clock: this.clock() };
    this.emit('death', { cause, side });
  }

  // ------------------------------------------------------------ commands
  cmd(name, args = {}) {
    if (this.result) return { ok: false, msg: 'ended' };
    const fn = this['c_' + name];
    if (!fn) return { ok: false, msg: 'unknown ' + name };
    if (this.pageLock && this.pageLock.t > 0 && CMD_PAGES[name] === this.pageLock.page) return { ok: false, msg: 'ACCESS DENIED — STARLIGHT' };
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
    if (r.offline) return { ok: false, msg: '节点离线' };
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
    if (this.paJam > 0) return { ok: false, msg: `分区放音被劫持 (${Math.ceil(this.paJam)}s)` };
    if (!this.rooms[room] || room === 'OF') return { ok: false };
    if (this.rooms[room].offline) return { ok: false, msg: `节点 ${room} 离线 — 无法放音` };
    this.lureCooldown = 3;
    this.lastLureRoom = room;
    this.stats.lures++;
    this.rooms[room].spike = 40;
    this.emit('lure', { room });
    for (const a of this.actors) if (a.onLure) a.onLure(room);
  }

  // hotbar: replay the last lure without opening the map
  c_lureRepeat() {
    if (!this.lastLureRoom) return { ok: false, msg: '还没有放过诱饵' };
    return this.c_lure({ room: this.lastLureRoom });
  }

  c_roomLight({ room, on }) {
    const r = this.rooms[room];
    if (!r || room === 'OF') return { ok: false };
    if (on && r.offline) return { ok: false, msg: `节点 ${room} 离线` };
    r.light = on === undefined ? !r.light : !!on;
  }

  c_seal({ room, on }) {
    const r = this.rooms[room];
    if (!r || room === 'OF') return { ok: false };
    const want = on === undefined ? !r.sealed : !!on;
    if (want) {
      if (['10', '12', '09', '13'].includes(room)) return { ok: false, msg: '该区域没有卷帘' };
      if (!this.calibrated.seal) return { ok: false, msg: '卷帘液压泵故障 (T-02)' };
      if (r.offline) return { ok: false, msg: `节点 ${room} 离线` };
      if (!this.powered('C6')) return { ok: false, msg: '传感网络离线' };
      // one hydraulic pump drives every shutter: one at a time
      if (Object.values(this.rooms).some((x) => x.sealed)) return { ok: false, msg: '另一道卷帘仍在落下' };
      if (this.shutterCd > 0) return { ok: false, msg: '卷帘液压复位中' };
      r.sealed = true;
      r.sealT = this.P.seal.maxTime;
    } else if (r.sealed) {
      r.sealed = false;
      this.shutterCd = this.P.seal.cooldown;
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

  requiredDone() {
    return this.tasks.every((x) => x.done || x.optional);
  }

  taskOpen(task) {
    return this.t >= task.open * this.P.hourSeconds;
  }

  c_taskComplete({ id }) {
    if (id.startsWith('T-08')) this.log(`>> 系统夺回 ${id.slice(4)} 完成.`, 'info');
    const task = this.tasks.find((x) => x.id === id);
    if (!task || task.done) return { ok: false };
    if (!this.taskOpen(task)) return { ok: false, msg: `任务 ${id} 尚未开放` };
    task.done = true;
    task.doneAt = this.t;
    if (id === 'T-01') {
      this.calibrated.sensors = true;
      for (const r of Object.values(this.rooms)) r.drift = 0;
    }
    if (id === 'T-02') {
      this.calibrated.lure = true;
      this.calibrated.seal = true;
    }
    if (id === 'T-03') this.calibrated.radio = true;
    if (id === 'T-07') this.fixCompressor();
    if (id === 'T-05') this.calibrated.winder = true;
    if (id === 'T-06') {
      if (this.generator.fuel > 0) {
        this.generator.running = true;
        this.resolveEmergency('E-5');
        this.log('备用发电机已启动.');
        this.emit('generator', { running: true });
      }
    }
    if (id === 'T-04') {
      this.calibrated.relays = true;
      for (const d of Object.values(this.doors)) d.stuckT = 0;
    }
    this.emit('task', { id });
    if (this.overtime && this.requiredDone()) this.finish('win');
  }

  c_rebootNode({ room }) {
    const r = this.rooms[room];
    if (!r || !r.offline) return { ok: false };
    r.offline = false;
    this.resolveEmergency('E-2', room);
    this.log(`节点 ${room} 已重启.`);
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
          const d = a.p.attackDelay;
          a.attackT = Array.isArray(d) ? d[Math.min(5, this.nightIndex - 1)] : d || 6;
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
    this.tickGenerator(dt);
    this.tickBoss(dt);
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
      if (this.requiredDone()) this.finish('win');
      else {
        this.overtime = true;
        this.log('交班清单未完成 — 进入加班!', 'warn');
        this.emit('overtime');
      }
    }
    if (this.overtime && !this.night.boss && this.t >= P.nightSeconds + P.overtimeSeconds) this.finish('fired');
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
      if (ph.t >= (ph.kind === 'spam' ? this.P.call.spamRing : this.P.call.ringTime)) {
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
      if (this.ventLevel()) parts.vent = P.vent * this.ventLevel();
      if (on('C5') && this.office.fan) parts.fan = P.fan;
      let lights = 0;
      let seals = 0;
      for (const r of Object.values(this.rooms)) {
        if (r.light) lights++;
        if (r.sealed) seals++;
      }
      if (lights) parts.roomLights = lights * P.roomLight;
      if (seals) parts.seals = seals * P.seal;
      if (this.generator.running) parts.generator = -P.generator;
      if (this.bossLoad) parts.boss = this.bossLoad;
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
    // on battery (grid down) every kW costs more
    this.drain((Math.max(0, load) * dt / 60) * (this.generator.gridDown ? this.P.generator.batteryMul : 1));
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
      mb.wind = Math.max(0, mb.wind - (this.night.windDrain || 0.01) * (this.calibrated.winder ? 0.7 : 1) * dt);
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
    const vent = this.ventLevel();
    let target = tp.out + T.equipment + T.lightPerLevel * light;
    target -= Math.max(0, target - tp.out) * Math.min(0.9, T.ventK * vent);
    tp.room += (target - tp.room) * (dt / T.tau);
    // the fan's cooling builds up and fades over ~20s: switching it off buys a
    // short quiet window before the terminal heats past the fault line
    const fanOn = this.powered('C5') && this.office.fan ? T.fan : 0;
    tp.fanCool += (fanOn - tp.fanCool) * Math.min(1, dt / T.fanTau);
    tp.eff = tp.room - tp.fanCool;
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
    if (this.ventLevel()) parts.vent = N.base + N.ventPerLevel * this.ventLevel();
    if (this.phone.state === 'ringing') parts.phone = N.phone;
    if (this.noise.degaussT > 0) {
      parts.degauss = N.degauss;
      this.noise.degaussT -= dt;
    }
    if (this.musicPlaying()) parts.musicBox = N.musicBox;
    if (this.generator.running) parts.generator = N.generator;
    if (this.noise.backfireT > 0) {
      parts.backfire = 52;
      this.noise.backfireT -= dt;
    }
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
      // node 12 reports over the untuned radio link: noisy and late (T-03 fixes it)
      if (id === '12' && !this.calibrated.radio) {
        r.lagged = (r.lagged ?? r.noise) + (r.noise - (r.lagged ?? r.noise)) * Math.min(1, dt / 1.2);
        r.reading = r.lagged + (this.rng.float() - 0.5) * 16;
      } else r.reading = r.noise;
      if (r.offline) r.reading = null;
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
          this.shutterCd = this.P.seal.cooldown;
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
    if (this.shutterCd > 0) this.shutterCd -= dt;
  }

  scanResult(room) {
    const nodes = nodesInRoom(room);
    const real = this.actors.filter((a) => nodes.includes(a.node) && (a.id !== 'tootie' || room === '13')).length;
    const acc = this.calibrated.sensors ? this.P.scan.accuracyCalibrated : this.P.scan.accuracy;
    let count = real;
    let falsePos = false;
    const boss = this.actor('starlight');
    const lies = boss && boss.phase >= 2 && !this.calibrated.sensors && this.rng.chance(this.P.boss.scanLie);
    if (lies || !this.rng.chance(acc)) {
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
    if (this.nightIndex >= 3) kinds.push('spamCall', 'nodeOffline');
    if (this.nightIndex >= 4) kinds.push('compressor');
    kind = kind || this.rng.pick(kinds);
    if (kind === 'spamCall') {
      if (this.phone.state !== 'idle') return;
      this.phone.state = 'ringing';
      this.phone.t = 0;
      this.phone.kind = 'spam';
      this.emit('phone', { state: 'ringing', spam: true });
      return;
    }
    if (kind === 'nodeOffline') {
      const room = this.rng.pick(['02', '06', '07', '08', '11', '12', '13']);
      if (this.rooms[room].offline) return;
      this.rooms[room].offline = true;
      this.rooms[room].light = false;
      this.log(`节点 ${room} 离线 (E-2: 到地图重启节点).`, 'warn');
      this.addEmergency('E-2', room);
      return;
    }
    if (kind === 'compressor') {
      const chef = this.actor('chef');
      if (this.compressor.fault || !chef || chef.node !== '05') return;
      this.compressor.fault = true;
      this.compressor.t = 0;
      this.log('冷库压缩机故障! (E-3: 完成 T-07 压缩机重启)', 'err');
      this.addEmergency('E-3');
      const t7 = this.tasks.find((x) => x.id === 'T-07');
      if (t7) t7.done = false;
      else this.tasks.push({ id: 'T-07', open: 0, done: false, doneAt: null, optional: true });
      this.emit('compressor');
      return;
    }
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
