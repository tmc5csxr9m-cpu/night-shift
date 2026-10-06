// Runs a bot against a World with human constraints: one action at a time,
// every action costs time (turning, focusing, page switches, clicks), new
// information only becomes usable after a reaction delay, and the bot only
// sees what a player could see (Observation). Only oracle bots get `world`.
import { Rng } from '../src/sim/rng.js';
import { SKILLS, TASK_TIME, CMD_PAGE } from './player-model.js';

const DIR_ERR = 0.15;      // chance a heard cue is placed on the wrong side
const ID_ERR = 0.1;        // chance a cue's source is misidentified
const SIDES = ['L', 'R', 'B', 'T', 'F'];

export class Agent {
  constructor(world, bot, { skill = 'average', seed = 1, oracle = false } = {}) {
    this.w = world;
    this.bot = bot;
    this.S = SKILLS[skill];
    this.skill = skill;
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.oracle = oracle;
    this.look = 'F';
    this.focused = false;
    this.page = 'home';
    this.busy = 0;              // seconds until the current action finishes
    this.current = null;
    this.mem = {};              // bot's private memory
    this.pendingInfo = [];      // perceived but not yet "registered" (reaction delay)
    this.heard = [];            // registered cues
    this.seen = { L: [], R: [], T: [] };
    this.seenAt = { L: -99, R: -99, T: -99 };
    this.emi = null;
    this.taskProgress = {};
    this.taskNeed = {};
    for (const t of world.tasks) {
      const [a, b] = TASK_TIME[t.id] || [20, 30];
      this.taskNeed[t.id] = this.rng.range(a, b) * this.S.taskMul;
      this.taskProgress[t.id] = 0;
    }
    this.actions = 0;
    this.usage = {};            // mechanic usage counters for the report
    world.on((ev) => this.onEvent(ev));
  }

  reaction() {
    const s = this.S;
    return s.reaction * Math.exp(this.rng.normal() * s.reactionSigma);
  }

  onEvent(ev) {
    if (ev.type !== 'cue') return;
    // attention tunnelling: absorbed in a task, sounds need to be louder to register
    const deaf = this.current?.a.type === 'task' ? this.S.taskDeaf : 0;
    const p = 1 / (1 + Math.exp(-(ev.db - this.w.noise.db - this.w.P.hearing.offset - this.S.hearOffset - deaf) / this.w.P.hearing.slope));
    if (!this.rng.chance(p)) return;
    let side = ev.side;
    if (this.rng.chance(DIR_ERR)) side = this.rng.pick(SIDES.filter((s) => s !== side));
    let source = ev.source;
    if (this.rng.chance(ID_ERR)) source = '?';
    this.pendingInfo.push({ at: this.w.t + this.reaction(), cue: { source, side, kind: ev.kind, db: ev.db, node: this.oracle ? ev.node : undefined, t: ev.t } });
  }

  // ---------------------------------------------------------------- observation
  observe() {
    const w = this.w;
    const t = w.t;
    // register perceived info after the reaction delay
    if (this.pendingInfo.length) {
      const ready = this.pendingInfo.filter((x) => x.at <= t);
      if (ready.length) {
        this.pendingInfo = this.pendingInfo.filter((x) => x.at > t);
        for (const r of ready) this.heard.push(r.cue);
        if (this.heard.length > 30) this.heard.splice(0, this.heard.length - 30);
      }
    }
    // looking at a lit door: see what stands in the corridor
    for (const side of ['L', 'R']) {
      if (!this.focused && this.look === side && w.doorLit(side)) {
        const nodes = side === 'L' ? ['DOOR_L', '07N', '07F'] : ['DOOR_R', '08N', '08F'];
        this.seen[side] = w.actors.filter((a) => nodes.includes(a.node)).map((a) => ({ id: a.id, node: a.node }));
        this.seenAt[side] = t;
      }
    }
    // the vent is on the front wall: visible whenever you look ahead
    if (!this.focused && this.look === 'F') {
      const r = w.actor('ribbon');
      this.seen.T = r && (r.node === 'VENT' || r.node === 'D2') ? [{ id: 'ribbon', node: r.node }] : [];
      this.seenAt.T = t;
    }
    // CRT edge interference, only visible while focused
    if (this.focused) {
      // perceived edge distortion; below the skill threshold it is not noticed
      // a distortion above the skill threshold is noticed at a hazard rate
      // (attention is on the task, not the screen edge); magnetisation hides it
      const e = w.emi;
      // blotches hide the edges; a hot tube shimmers
      const thr = this.S.emiThreshold + e.magnet * 0.5 + (w.faulty() ? 0.15 : 0);
      this.emiSeen = this.emiSeen || { L: 0, R: 0, B: 0, T: 0 };
      const pNotice = 1 - Math.exp(-this.S.emiNotice * w.P.tick);
      const out = { magnet: e.magnet };
      for (const k of ['L', 'R', 'B', 'T']) {
        if (e[k] > thr) {
          if (!this.emiSeen[k] && this.rng.chance(pNotice)) this.emiSeen[k] = e[k];
          if (this.emiSeen[k]) this.emiSeen[k] = Math.max(this.emiSeen[k] * 0.98, e[k]);
        } else if (e[k] < thr * 0.5) this.emiSeen[k] = 0;
        out[k] = this.emiSeen[k];
      }
      this.emi = out;
    } else this.emi = null;

    // tasks that appear mid-night (emergency T-07) or come back undone
    for (const x of w.tasks) {
      if (this.taskNeed[x.id] === undefined || (!x.done && this.taskProgress[x.id] >= this.taskNeed[x.id])) {
        const [lo, hi] = TASK_TIME[x.id] || [20, 30];
        this.taskNeed[x.id] = this.rng.range(lo, hi) * this.S.taskMul;
        this.taskProgress[x.id] = 0;
      }
    }
    const obs = {
      t, hour: w.hour, overtime: w.overtime, night: w.nightIndex,
      look: this.look, focused: this.focused, page: this.page,
      heard: this.heard,
      seen: this.seen, seenAt: this.seenAt,
      emi: this.emi,
      doors: {
        L: { on: w.doors.L.on, lit: w.doorLit('L'), hot: w.doors.L.heat > w.P.doorLight.warn, broken: w.doors.L.broken, stuck: w.doors.L.stuckT > 0 },
        R: { on: w.doors.R.on, lit: w.doorLit('R'), hot: w.doors.R.heat > w.P.doorLight.warn, broken: w.doors.R.broken, stuck: w.doors.R.stuckT > 0 },
      },
      spares: w.spares,
      musicPlaying: w.musicPlaying(),     // audible anywhere
      tripped: w.power.tripped, powerOut: w.power.out,
      phone: w.phone.state,
      tasks: w.tasks.map((x) => ({ id: x.id, done: x.done, optional: !!x.optional, open: w.taskOpen(x), progress: this.taskProgress[x.id], need: this.taskNeed[x.id] })),
      circuits: { ...w.circuits },        // known: player sets them (and the log reports trips)
      calibrated: { ...w.calibrated },
      office: { light: w.office.light, fan: w.office.fan, vent: w.office.vent, maglock: w.office.maglock, coilLockout: w.office.coilLockout > 0 },
      shutterBusy: !w.calibrated.seal || Object.values(w.rooms).some((r) => r.sealed) || w.shutterCd > 0,
    };
    if (this.focused) {
      obs.power = { pct: w.powerPct(), load: w.power.load };
      obs.emergencies = w.emergencies.map((e) => ({ ...e }));
      obs.wind = w.musicBox.wind;
      obs.autoWind = w.musicBox.auto;
      obs.coil = w.office.coil / w.P.maglock.maxLock;
      obs.offline = Object.entries(w.rooms).filter(([, r]) => r.offline).map(([id]) => id);
      obs.temp = w.temp.eff;
      obs.pageLock = w.pageLock && w.pageLock.t > 0 ? w.pageLock.page : null;
      obs.paJam = w.paJam > 0;
      const boss = w.actor('starlight');
      if (boss) {
        obs.bossPending = boss.pending ? boss.pending.id : null;
        obs.locks = Object.fromEntries(Object.entries(w.locks).map(([k, l]) => [k, { t: l.t, cd: l.cd }]));
        obs.bossPhase = boss.phase;
      }
      obs.faulty = w.faulty();
      obs.magnet = w.emi.magnet;
      const chef = w.actor('chef');
      if (chef) obs.freezerThaw = chef.thaw;   // shown on the power page
      if (this.page === 'map' && w.powered('C6')) {
        obs.rooms = {};
        for (const [id, r] of Object.entries(w.rooms)) obs.rooms[id] = { noise: r.noise, result: r.result, light: r.light, sealed: r.sealed, scanning: r.scanT > 0, scanCd: r.scanCd };
      }
      this.mem.lastFocusObs = obs;
    }
    if (this.oracle) obs.world = w;
    return obs;
  }

  // ---------------------------------------------------------------- acting
  // returns the time cost of getting into position for an action
  positionCost(needFocus, page) {
    const S = this.S;
    let c = 0;
    if (needFocus && !this.focused) {
      if (this.look !== 'F') c += S.turn;
      c += S.focus;
    }
    if (page && this.page !== page) c += S.page + S.click;
    return c;
  }

  clickCost() {
    let c = this.S.click;
    if (this.rng.chance(this.S.misclick + (this.w.faulty() ? 0.1 : 0))) c += this.S.click;
    return c;
  }

  // action: {type, ...}
  start(a) {
    const S = this.S;
    let cost = this.rng.range(S.think[0], S.think[1]);
    let after = null;
    switch (a.type) {
      case 'wait':
        cost = a.dur;
        break;
      case 'look': {
        if (this.focused) cost += S.focus;
        if (this.look !== a.dir) cost += a.dir === 'F' || this.look === 'F' ? S.turn : S.turn * 1.8;
        after = () => {
          this.focused = false;
          this.look = a.dir;
          this.w.cmd('focus', { on: false });
          this.w.cmd('look', { dir: a.dir });
        };
        break;
      }
      case 'focus':
        cost += this.positionCost(true, a.page);
        after = () => this.enter(a.page);
        break;
      case 'cmd': {
        const page = CMD_PAGE[a.name] ?? null;
        cost += this.positionCost(true, page) + this.clickCost();
        // map actions: pick the room first (one more click + a moment to find it)
        if (page === 'map' && a.args?.room && a.args.room !== this.mapSel) {
          cost += this.clickCost() + this.S.mapFind;
          this.mapSel = a.args.room;
        }
        after = () => {
          this.enter(page);
          const r = this.w.cmd(a.name, a.args || {});
          this.usage[a.name] = (this.usage[a.name] || 0) + 1;
          if (a.onResult) a.onResult(r);
        };
        break;
      }
      case 'hold': {   // wind music box / replace bulb
        const page = CMD_PAGE[a.name];
        cost += this.positionCost(true, page) + a.dur;
        after = () => {
          this.enter(page);
          // winding happens continuously while the button is held
          if (a.name === 'wind') for (let k = 0; k < a.dur; k += 0.5) this.w.cmd('wind', { dt: Math.min(0.5, a.dur - k) });
          else this.w.cmd(a.name, a.args || {});
          this.usage[a.name] = (this.usage[a.name] || 0) + 1;
        };
        break;
      }
      case 'task': {
        cost += this.positionCost(true, 'tasks') + a.dur;
        after = () => {
          this.enter('tasks');
          // a hot or magnetised terminal makes the work slower
          const slow = (this.w.faulty() ? 1.6 : 1) * (1 + this.w.emi.magnet);
          this.taskProgress[a.id] += a.dur / slow;
          if (this.taskProgress[a.id] >= this.taskNeed[a.id]) this.w.cmd('taskComplete', { id: a.id });
        };
        break;
      }
      default:
        return;
    }
    // a hot terminal garbles rows: re-reading the screen costs time
    if (this.w.faulty() && (a.type === 'cmd' || a.type === 'hold') && this.rng.chance(0.45)) cost += this.rng.range(0.4, 1.2);
    // position changes happen at the start (you turn first, then act)
    if (a.type === 'cmd' || a.type === 'hold' || a.type === 'task' || a.type === 'focus') this.preEnter(a);
    this.busy = cost;
    this.current = { a, after };
    if (a.type !== 'wait') this.actions++;
  }

  preEnter(a) {
    if (!this.focused) {
      this.focused = true;
      this.look = 'F';
      this.w.cmd('focus', { on: true });
      this.w.cmd('look', { dir: 'F' });
    }
    const page = a.type === 'task' ? 'tasks' : a.type === 'focus' ? a.page : CMD_PAGE[a.name];
    if (page) this.enter(page);
  }

  enter(page) {
    this.focused = true;
    if (page && this.page !== page) {
      this.page = page;
      this.w.cmd('page', { page });
    }
  }

  step() {
    const w = this.w;
    const dt = w.P.tick;
    if (this.busy > 0) {
      this.busy -= dt;
      // a long task chunk can be abandoned when something urgent is heard
      if (this.busy > 0 && this.current?.a.type === 'task' && this.bot.interrupt?.(this.observe(), this)) {
        const done = (this.current.a.dur - this.busy);
        if (done > 0) this.taskProgress[this.current.a.id] += done;
        this.busy = 0;
        this.current = null;
      }
      if (this.busy > 0) return;
      if (this.current?.after) this.current.after();
      this.current = null;
    }
    const obs = this.observe();
    const a = this.bot.decide(obs, this);
    if (a) this.start(a);
    else this.start({ type: 'wait', dur: 0.1 });
  }
}

// run one full night; returns a compact record
export function playNight(World, { night, seed, bot, skill, oracle, params, maxT = 700 }) {
  const w = new World({ night, seed, params });
  const agent = new Agent(w, bot, { skill, seed, oracle });
  bot.reset?.(agent);
  let firstWarn = {};
  w.on((ev) => {
    // fairness: a warning counts if it is audible in a quiet office (the
    // player chose any extra noise); deaths after that are avoidable
    const pQuiet = 1 / (1 + Math.exp(-(ev.db - w.P.noise.base - w.P.hearing.offset) / w.P.hearing.slope));
    if (ev.type === 'cue' && pQuiet >= 0.5 && firstWarn[ev.source] === undefined) firstWarn[ev.source] = ev.t;
    if (ev.type === 'repel' || (ev.type === 'move' && ev.to === '01')) delete firstWarn[ev.actor];
  });
  while (!w.result && w.t < maxT) {
    w.tick();
    agent.step();
  }
  const r = w.result || { outcome: 'timeout', t: w.t };
  return {
    outcome: r.outcome,
    cause: r.cause || null,
    t: r.t,
    overtime: !!r.overtime,
    power: w.powerPct(),
    minPower: w.stats.minPower,
    burned: w.stats.burned,
    repels: w.stats.repels,
    tasksDone: w.tasks.filter((x) => x.done).length,
    actions: agent.actions,
    usage: agent.usage,
    warnLead: r.cause && firstWarn[r.cause] !== undefined ? r.t - firstWarn[r.cause] : null,
  };
}
