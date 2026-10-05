// Rule-based player. Beliefs come from what the agent perceived (heard
// cues, door glances, CRT edge interference); the oracle variant reads the
// true world state instead but keeps the same human timing.

const PROFILES = {
  novice: { sealNear: false, sealFallback: false, quietChance: 0.5, checkEvery: 0, useEmi: true, preLure: false, stageCut: false, lightHold: 3.4, chunk: 7, careBulbs: false, confirmLook: false },
  average: { sealNear: false, sealFallback: true, quiet: true, checkEvery: 30, useEmi: true, preLure: false, stageCut: false, lightHold: 3.0, chunk: 4.5, careBulbs: true, confirmLook: false },
  expert: { sealNear: true, sealFallback: true, quiet: true, checkEvery: 22, useEmi: true, preLure: false, stageCut: true, lightHold: 2.8, chunk: 3, careBulbs: true, confirmLook: true },
};

const PIP_LURES_DOOR = ['08', '11', '02'];
const PIP_LURES_NEAR = ['06', '13', '02', '11'];

export function heuristicBot(level = 'average', { oracle = false, disable = {} } = {}) {
  const K = { ...PROFILES[level] };
  return {
    name: oracle ? 'B5' : { novice: 'B2', average: 'B3', expert: 'B4' }[level],
    reset(agent) {
      agent.mem = { quiet: K.quiet || agent.rng.chance(K.quietChance || 0), lightOffAt: { L: 0, R: 0 }, lastCheck: 0, lastLure: null, handled: {}, stageCut: false, stageScanAt: 0 };
    },

    // ------------------------------------------------------------ beliefs
    beliefs(o, agent) {
      const m = agent.mem;
      const t = o.t;
      const b = { sunnyDoor: false, sunnyNear: false, pipDoor: false, pipNear: false, pipFar: false, tootie: false };
      if (oracle) {
        const w = o.world;
        for (const a of w.actors) {
          if (a.id === 'sunny') {
            b.sunnyDoor = a.node === 'DOOR_L';
            b.sunnyNear = a.node === '07N' || a.node === '07F';
          }
          if (a.id === 'pip') {
            b.pipDoor = a.node === 'DOOR_R';
            b.pipNear = a.node === '08N' || a.node === '08F';
            b.pipFar = a.node === '11' || a.node === '06';
            b.pipNode = a.node;
          }
          if (a.id === 'tootie') b.tootie = a.state !== 'dormant';
        }
        return b;
      }
      const recent = (dt) => o.heard.filter((c) => t - c.t < dt);
      for (const c of recent(12)) {
        if (m.handled[c.source] && c.t <= m.handled[c.source]) continue;
        if (c.source === 'sunny' || (c.source === '?' && c.side === 'L')) {
          if (c.kind === 'greet') b.sunnyDoor = true;
          else if (c.db >= 42) b.sunnyNear = true;
        }
        if (c.source === 'pip' || (c.source === '?' && c.side === 'R')) {
          if (c.kind === 'greet') b.pipDoor = true;
          else if (c.db >= 41) b.pipNear = true;
          else if (c.db >= 33) b.pipFar = true;
        }
        if (c.source === 'tootie') b.tootie = true;
      }
      // what we saw at the doors (fresh glance only)
      for (const side of ['L', 'R']) {
        if (t - o.seenAt[side] > 2) continue;
        for (const s of o.seen[side]) {
          if (s.id === 'sunny') {
            if (s.node === 'DOOR_L') b.sunnyDoor = true;
            else b.sunnyNear = true;
          }
          if (s.id === 'pip') {
            if (s.node === 'DOOR_R') b.pipDoor = true;
            else b.pipNear = true;
          }
          if (s.id === 'tootie') b.tootie = true;
        }
      }
      if (K.useEmi && o.emi && !disable.emi) {
        if (o.emi.L > 0.5) b.sunnyDoor = true;
        else if (o.emi.L > 0) b.sunnyNear = true;
        if (o.emi.R > 0.4) b.pipDoor = true;
        else if (o.emi.R > 0) b.pipNear = true;
      }
      if (!o.musicPlaying) b.tootie = true;
      return b;
    },

    // abandon a task chunk when something urgent shows up
    interrupt(o, agent) {
      const b = this.beliefs(o, agent);
      return b.sunnyDoor || b.pipDoor || b.tootie || (o.emergencies && o.emergencies.length > 0);
    },

    pickLureDry(list, m, o) {
      const uses = m.lureHour === o.hour ? m.lureUses : {};
      return list.find((r) => (uses[r] || 0) < 4);
    },

    pickLure(list, m, o) {
      if (m.lureHour !== o.hour) {
        m.lureHour = o.hour;
        m.lureUses = {};
      }
      // least-used room first (habituation shortens repeated lures)
      const room = list.filter((r) => (m.lureUses[r] || 0) < 5).sort((a, b) => (m.lureUses[a] || 0) - (m.lureUses[b] || 0) || (a === m.lastLure) - (b === m.lastLure))[0];
      if (!room) return null;
      m.lastLure = room;
      m.lureUses[room] = (m.lureUses[room] || 0) + 1;
      return room;
    },

    // ------------------------------------------------------------ policy
    decide(o, agent) {
      const m = agent.mem;
      const t = o.t;
      const b = this.beliefs(o, agent);

      // lights we switched on for a reason go off again (heat / power)
      for (const side of ['L', 'R']) {
        const holding = side === 'L' ? b.sunnyDoor : b.pipDoor;
        if (o.doors[side].on && t >= m.lightOffAt[side] && !(holding && t < m.lightOffAt[side] + 2)) {
          return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
        }
        if (o.doors[side].on && o.doors[side].hot && K.careBulbs) return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
      }

      // power emergencies
      if (o.tripped) return { type: 'cmd', name: 'resetMain' };

      // a quiet office: the fan masks footsteps and draws Pip in
      if (m.quiet && o.night >= 2 && o.office.fan && !disable.quiet) return { type: 'cmd', name: 'fan', args: { on: false } };

      // music stopped: restore C7 first, then wind
      if (b.tootie) {
        if (!o.circuits.C7) return { type: 'cmd', name: 'breaker', args: { id: 'C7', on: true } };
        if (o.focused && o.wind !== undefined && o.wind < 0.35) return { type: 'hold', name: 'wind', dur: 2 };
      }

      // Sunny at the left door: hold the light on it
      if (b.sunnyDoor && !disable.doorLight) {
        if (!o.doors.L.lit && !o.doors.L.broken && !o.doors.L.stuck) {
          m.lightOffAt.L = t + K.lightHold;
          m.handled.sunny = t;
          return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
        }
        if (o.doors.L.lit) {
          m.handled.sunny = t;
          // the light does the work; deal with the other door meanwhile
          if (!b.pipDoor && !b.tootie) {
            if (K.confirmLook && o.look !== 'L' && t > m.lightOffAt.L - 1.2) return { type: 'look', dir: 'L' };
            return { type: 'wait', dur: 0.3 };
          }
        }
      }

      // Pip at the right door: light makes it pose (buys time), then lure it away
      if (b.pipDoor && !o.doors.R.lit && !o.doors.R.broken && !o.doors.R.stuck && !o.doors.R.hot && !disable.doorLight && !disable.pipLight) {
        m.lightOffAt.R = t + 5;
        return { type: 'cmd', name: 'doorLight', args: { side: 'R', on: true } };
      }
      if (b.pipDoor && !disable.lure && o.calibrated.lure && o.circuits.C7 && t >= (m.lureReady || 0)) {
        const room = this.pickLure(PIP_LURES_DOOR, m, o);
        if (room) {
          m.lureReady = t + 3.1;
          m.handled.pip = t;
          return { type: 'cmd', name: 'lure', args: { room } };
        }
      }
      // Pip in the east hall: drop the shutter so it cannot reach the door
      const sealReady = t >= (m.sealReady || 0) && !disable.seal;
      const budgetLow = !this.pickLureDry(PIP_LURES_DOOR, m, o);
      if (b.pipNear && !b.pipDoor && sealReady && (K.sealNear || (K.sealFallback && budgetLow))) {
        m.sealReady = t + 30;   // 20s down + 10s re-arm
        return { type: 'cmd', name: 'seal', args: { room: '08', on: true } };
      }
      if (K.preLure && (b.pipNear || b.pipFar) && o.calibrated.lure && o.circuits.C7 && !disable.lure && t >= (m.lureReady || 0) && t - (m.lastLureT || 0) > 6) {
        const room = this.pickLure(PIP_LURES_NEAR, m, o);
        if (room) {
          m.lastLureT = t;
          m.lureReady = t + 3.1;
          m.handled.pip = t;
          return { type: 'cmd', name: 'lure', args: { room } };
        }
      }

      // emergencies
      if (o.emergencies) {
        const e = o.emergencies.find((x) => x.id === 'E-1');
        if (e && o.spares > 0) return { type: 'hold', name: 'replaceBulb', args: { side: e.side }, dur: 4 };
      }

      // expert: cut stage power once the stage is confirmed empty
      if (K.stageCut && !disable.stageCut && !m.stageCut && t > 120 && o.circuits.C9) {
        const r = o.rooms && o.rooms['01'];
        if (r && r.result && r.result.count === 0 && t - m.stageScanAt < 8) {
          m.stageCut = true;
          return { type: 'cmd', name: 'breaker', args: { id: 'C9', on: false } };
        }
        if (t - m.stageScanAt > 40) {
          m.stageScanAt = t;
          return { type: 'cmd', name: 'scan', args: { room: '01' } };
        }
      }

      // periodic glance at the left door when we have heard nothing
      if (K.checkEvery && t - m.lastCheck > K.checkEvery && !disable.doorLight) {
        m.lastCheck = t;
        if (!o.doors.L.lit && !o.doors.L.broken) {
          m.lightOffAt.L = t + 1.6;
          return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
        }
      }

      // otherwise: work on tasks
      const task = o.tasks.find((x) => !x.done);
      if (task) return { type: 'task', id: task.id, dur: Math.min(K.chunk, task.need - task.progress + 0.05) };
      return { type: 'wait', dur: 0.5 };
    },
  };
}
