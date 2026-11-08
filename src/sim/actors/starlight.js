// STARLIGHT — Night 6. Not a body: it has taken over the terminal and
// drives the building. Phases by time (P0..P4, see GAME_PLAN 7.2).
//   P1 seize the breakers   P2 lie to the sensors   P3 seize the terminal
//   P4 hide and seek: it attacks the door you are least ready to defend —
//      unless the office is dark and its camera (the head on the shelf)
//      cannot see you.
import { Actor } from './base.js';
import { NODE_SIDE } from '../graph.js';

const TARGETS = ['C0', 'C7', 'C2', 'C3', 'C6', 'C4', 'C8'];
const FAKE_NODES = ['07N', '08N', '12', 'D2', '07F', '08F'];
const FAKE_SRC = { '07N': 'sunny', '07F': 'sunny', '08N': 'pip', '08F': 'pip', '12': 'back', D2: 'ribbon' };
const PAGES = ['map', 'power', 'facility', 'tasks'];

export class Starlight extends Actor {
  constructor(w) {
    super(w, 'starlight', 'SHOW');
    this.state = 'idle';
    this.phase = 0;
    this.nextT = 20;
    this.pending = null;      // { id, t } breaker about to be taken
    this.fakeT = 8;
    this.lureHijacked = false;
    this.pageT = 25;
    this.ventT = 30;
    this.paT = 12;
    this.attackT2 = 10;
  }

  baseA() {
    return 0;
  }

  phaseAt(t) {
    const H = this.w.P.hourSeconds;
    if (this.w.stuck) return 4;
    if (t < H) return 0;
    if (t < 2.5 * H) return 1;
    if (t < 4 * H) return 2;
    if (t < 5.5 * H) return 3;
    return 4;
  }

  tick(dt) {
    const w = this.w;
    const P = this.p;
    const ph = this.phaseAt(w.t);
    if (ph !== this.phase) {
      this.phase = ph;
      w.emit('bossPhase', { phase: ph });
      w.log(['', '>> STARLIGHT: 我先借用你的电.', '>> STARLIGHT: 你的眼睛会说谎.', '>> STARLIGHT: 现在, 我坐到你的位置上.', '>> STARLIGHT: 捉迷藏. 三扇门.'][ph], 'err');
      if (ph === 3) {
        w.bossLoad = P.extraLoad;
        w.log('负载激增 — 将超过跳闸上限! 断开回路或启动发电机 (T-06).', 'err');
        w.restartGenTask();
      }
    }
    // ---- P1+: take a breaker after a 3s warning
    if (ph >= 1 && ph <= 3) {
      if (this.pending) {
        this.pending.t -= dt;
        if (this.pending.t <= 0) {
          const id = this.pending.id;
          this.pending = null;
          if (w.breakerLocked(id)) w.log(`>> STARLIGHT 试图接管 ${id} — 写保护拦截.`, 'warn');
          else if (w.circuits[id]) {
            w.circuits[id] = false;
            // held open for a while: closing it again has to wait
            w.seized[id] = P.seizeTime;
            w.log(`>> STARLIGHT 接管了回路 ${id} (${P.seizeTime} 秒内无法闭合).`, 'err');
            w.emit('breaker', { id, on: false, boss: true });
          }
        }
      } else {
        this.nextT -= dt;
        if (this.nextT <= 0) {
          this.nextT = w.rng.range(P.breakerGap[0], P.breakerGap[1]);
          const id = w.rng.pick(TARGETS.filter((c) => w.circuits[c]));
          if (id) {
            this.pending = { id, t: P.breakerWarn };
            w.log(`!! 继电器 ${id} 异常活动 (3 秒内锁定回路!)`, 'err');
            w.emit('bossTelegraph', { kind: 'breaker', id });
          }
        }
      }
    }
    // ---- P2+: fake sounds; one hijacked lure that pulls Pip toward you
    if (ph >= 2) {
      this.fakeT -= dt;
      if (this.fakeT <= 0) {
        this.fakeT = w.rng.range(6, 12);
        const node = w.rng.pick(FAKE_NODES);
        const src = FAKE_SRC[node];
        const db = (w.P.cues[src]?.[node] || 40) + 2;
        // a cue the player cannot tell from a real one
        const c = { source: src, node, side: NODE_SIDE[node] || 'F', db, kind: 'step', p: w.hearP(db), t: w.t, fake: true };
        w.cues.push(c);
        w.emit('cue', c);
        const r = w.rooms[node.slice(0, 2)];
        if (r) r.spike = Math.max(r.spike, w.P.scan.stepSpike[0] + w.P.scan.stepSpike[1]);
      }
      if (!this.lureHijacked && w.t > 3 * w.P.hourSeconds) {
        this.lureHijacked = true;
        const pip = w.actor('pip');
        w.log('>> STARLIGHT 劫持了广播: 东廊响起了派对铃.', 'err');
        w.emit('lure', { room: '08', hijack: true });
        if (pip && pip.state !== 'door') {
          pip.lure = { node: '08N', t: 10 };
          pip.lureStep = 0.5;
        }
      }
    }
    // ---- P3: lock a terminal page, choke the ventilation
    if (ph === 3) {
      this.pageT -= dt;
      if (this.pageT <= 0) {
        this.pageT = w.rng.range(30, 45);
        w.pageLock = { page: w.rng.pick(PAGES), t: P.pageLock };
        w.log(`>> ACCESS DENIED: ${w.pageLock.page.toUpperCase()}`, 'err');
        w.emit('pageLock', { page: w.pageLock.page });
      }
      // it takes the PA zone selector: no lures for a while — hold them
      // with light and shutters instead
      // (with a warning: the PA crackles 3 s before it is taken)
      this.paT -= dt;
      if (this.paPending > 0) {
        this.paPending -= dt;
        if (this.paPending <= 0) {
          w.paJam = P.paJam;
          w.log('>> STARLIGHT 占用了分区广播 — 诱饵不可用.', 'err');
          w.emit('paJam', { dur: P.paJam });
        }
      } else if (this.paT <= 0) {
        this.paT = w.rng.range(P.paGap[0], P.paGap[1]);
        this.paPending = P.paWarn;
        w.log('!! 广播线路杂音 — 3 秒后将被占用!', 'err');
        w.emit('bossTelegraph', { kind: 'pa' });
      }
      this.ventT -= dt;
      if (this.ventT <= 0) {
        this.ventT = w.rng.range(35, 50);
        w.ventHijack = P.ventHijack;
        w.log('>> STARLIGHT 关闭了通风.', 'err');
      }
    }
    // ---- P4: hide and seek
    if (ph === 4) {
      // the same pace as at 05:30 — also while the clock is held at 05:59
      this.attackT2 -= dt;
      const gap = P.attackGap;
      if (this.attackT2 <= 0) {
        this.attackT2 = w.rng.range(gap * 0.8, gap * 1.2);
        this.launch();
      }
    }
  }

  // pick the door the player is least able to defend right now
  launch() {
    const w = this.w;
    const options = [];
    const sunny = w.actor('sunny');
    const pip = w.actor('pip');
    const back = w.actor('back');
    if (sunny && sunny.state !== 'door') options.push({ a: sunny, side: 'L', weak: (w.doors.L.broken ? 3 : 0) + (w.doors.L.heat > 60 ? 1 : 0) + (w.player.look === 'L' ? -2 : 0) });
    if (pip && pip.state !== 'door') options.push({ a: pip, side: 'R', weak: (pip.lureUses?.['08'] || 0) + (w.player.look === 'R' ? -2 : 0) });
    if (back && back.state !== 'door') options.push({ a: back, side: 'B', weak: (w.office.coilLockout > 0 ? 3 : 0) + (w.office.coil > 10 ? 1 : 0) });
    if (!options.length) return;
    let pick;
    if (w.officeDark()) pick = w.rng.pick(options);          // it cannot see you
    else pick = options.sort((x, y) => y.weak - x.weak || w.rng.float() - 0.5)[0];
    w.emit('bossTelegraph', { kind: 'attack', side: pick.side });
    w.cue('starlight', pick.side === 'L' ? '07N' : pick.side === 'R' ? '08N' : '12', 46, 'boss');
    pick.a.forceDoor?.(this.p.telegraph);
  }

  info() {
    return { phase: this.phase, pending: this.pending ? `${this.pending.id} ${this.pending.t.toFixed(1)}` : '-', next: this.nextT, attack: this.attackT2 };
  }
}
