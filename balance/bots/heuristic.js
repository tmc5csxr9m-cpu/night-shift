// Rule-based player. Beliefs come from what the agent perceived (heard
// cues, door glances, CRT edge interference); the oracle variant reads the
// true world state instead but keeps the same human timing.
//
// Profiles describe how much of the toolbox a player of that level uses.

const PROFILES = {
  novice: {
    quietChance: 0.4, checkEvery: 0, useEmi: true, lightHold: 3.4, chunk: 7, careBulbs: false, confirmLook: false,
    sealNear: false, sealFallback: false, heatMgmt: false, dim: false, degauss: false, roomFreeze: false,
    stageCut: false, preLure: false, chefBellEarly: false,
  },
  average: {
    quietChance: 1, checkEvery: 30, useEmi: true, lightHold: 3.0, chunk: 4.5, careBulbs: true, confirmLook: false,
    sealNear: true, sealFallback: true, heatMgmt: true, dim: false, degauss: true, roomFreeze: false,
    stageCut: false, preLure: false, chefBellEarly: false,
  },
  expert: {
    quietChance: 1, checkEvery: 22, useEmi: true, lightHold: 2.8, chunk: 3, careBulbs: true, confirmLook: true,
    sealNear: true, sealFallback: true, heatMgmt: true, dim: true, degauss: true, roomFreeze: true,
    stageCut: true, preLure: false, chefBellEarly: true,
  },
};

const PIP_LURES_DOOR = ['08', '11', '02'];

export function heuristicBot(level = 'average', { oracle = false, disable = {} } = {}) {
  const K = { ...PROFILES[level] };
  return {
    name: oracle ? 'B5' : { novice: 'B2', average: 'B3', expert: 'B4' }[level],
    reset(agent) {
      agent.mem = {
        quiet: agent.rng.chance(K.quietChance), lightOffAt: { L: 0, R: 0 }, lastCheck: 0, lastLure: null,
        handled: {}, stageCut: false, stageScanAt: 0, lureUses: {}, lureHour: -1, freezeUntil: 0,
      };
    },

    // ------------------------------------------------------------ beliefs
    beliefs(o, agent) {
      const m = agent.mem;
      const t = o.t;
      const b = { sunnyDoor: false, sunnyNear: false, pipDoor: false, pipNear: false, pipFar: false, tootie: false, chefDoor: null, chefAwake: false };
      if (oracle) {
        for (const a of o.world.actors) {
          if (a.id === 'sunny') {
            b.sunnyDoor = a.node === 'DOOR_L';
            b.sunnyNear = a.node === '07N' || a.node === '07F';
          }
          if (a.id === 'pip') {
            b.pipDoor = a.node === 'DOOR_R';
            b.pipNear = a.node === '08N' || a.node === '08F';
            b.pipFar = a.node === '11' || a.node === '06';
          }
          if (a.id === 'tootie') b.tootie = a.state !== 'dormant';
          if (a.id === 'chef') {
            b.chefAwake = a.state === 'awake' || a.state === 'door';
            if (a.state === 'door') b.chefDoor = a.node === 'DOOR_L' ? 'L' : 'R';
          }
        }
        return b;
      }
      for (const c of o.heard) {
        if (t - c.t > 12) continue;
        if (m.handled[c.source] && c.t <= m.handled[c.source]) continue;
        const src = c.source;
        if (src === 'sunny' || (src === '?' && c.side === 'L')) {
          if (c.kind === 'greet' || c.db >= 48) b.sunnyDoor = true;
          else if (c.db >= 42) b.sunnyNear = true;
        }
        if (src === 'pip' || (src === '?' && c.side === 'R')) {
          if (c.kind === 'greet' || c.db >= 47) b.pipDoor = true;
          else if (c.db >= 41) b.pipNear = true;
          else if (c.db >= 33) b.pipFar = true;
        }
        if (src === 'tootie') b.tootie = true;
        if (src === 'chef') {
          b.chefAwake = true;
          if (c.kind === 'greet') b.chefDoor = c.side === 'L' || c.side === 'R' ? c.side : 'L';
        }
      }
      // remember an awake chef for a while (it is slow)
      if (b.chefAwake) m.chefSeen = t;
      if (m.chefSeen && t - m.chefSeen < 40) b.chefAwake = true;
      for (const side of ['L', 'R']) {
        if (t - o.seenAt[side] > 2) continue;
        for (const s of o.seen[side]) {
          const door = s.node.startsWith('DOOR');
          if (s.id === 'sunny') door ? (b.sunnyDoor = true) : (b.sunnyNear = true);
          if (s.id === 'pip') door ? (b.pipDoor = true) : (b.pipNear = true);
          if (s.id === 'tootie') b.tootie = true;
          if (s.id === 'chef') {
            b.chefAwake = true;
            if (door) b.chefDoor = side;
          }
        }
      }
      if (K.useEmi && o.emi && !disable.emi) {
        if (o.emi.L > 0.5 && !b.chefDoor) b.sunnyDoor = true;
        else if (o.emi.L > 0) b.sunnyNear = true;
        if (o.emi.R > 0.4 && b.chefDoor !== 'R') b.pipDoor = true;
        else if (o.emi.R > 0) b.pipNear = true;
      }
      if (!o.musicPlaying) b.tootie = true;
      return b;
    },

    interrupt(o, agent) {
      const b = this.beliefs(o, agent);
      return b.sunnyDoor || b.pipDoor || b.tootie || b.chefDoor || (o.emergencies && o.emergencies.length > 0);
    },

    pickLure(list, m, o) {
      if (m.lureHour !== o.hour) {
        m.lureHour = o.hour;
        m.lureUses = {};
      }
      const room = list.filter((r) => (m.lureUses[r] || 0) < 5).sort((a, b) => (m.lureUses[a] || 0) - (m.lureUses[b] || 0) || (a === m.lastLure) - (b === m.lastLure))[0];
      if (!room) return null;
      m.lastLure = room;
      m.lureUses[room] = (m.lureUses[room] || 0) + 1;
      return room;
    },

    lureBudgetLow(m, o) {
      const uses = m.lureHour === o.hour ? m.lureUses : {};
      return PIP_LURES_DOOR.every((r) => (uses[r] || 0) >= 2);
    },

    // ------------------------------------------------------------ policy
    decide(o, agent) {
      const m = agent.mem;
      const t = o.t;
      const b = this.beliefs(o, agent);
      const canLure = o.calibrated.lure && o.circuits.C7 && !disable.lure && t >= (m.lureReady || 0);

      // lights we switched on go off again (heat / power)
      for (const side of ['L', 'R']) {
        const holding = side === 'L' ? b.sunnyDoor : b.pipDoor;
        if (o.doors[side].on && t >= m.lightOffAt[side] && !(holding && t < m.lightOffAt[side] + 2)) {
          return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
        }
        if (o.doors[side].on && o.doors[side].hot && K.careBulbs) return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
      }
      if (o.tripped) return { type: 'cmd', name: 'resetMain' };

      // music stopped: power the PA first, then wind
      if (b.tootie) {
        if (!o.circuits.C7) return { type: 'cmd', name: 'breaker', args: { id: 'C7', on: true } };
        if (o.focused && o.wind !== undefined && o.wind < 0.35) return { type: 'hold', name: 'wind', dur: 2 };
      }
      // never leave the freezer off by accident
      if (!o.circuits.C0 && !disable.freezer) return { type: 'cmd', name: 'breaker', args: { id: 'C0', on: true } };
      // a breaker that tripped on its own (aging): close it again
      for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C8']) {
        if (!o.circuits[id] && t - (m.breakerFixAt || -99) > (level === 'novice' ? 15 : 3)) {
          m.breakerFixAt = t;
          return { type: 'cmd', name: 'breaker', args: { id, on: true } };
        }
      }

      // Chef at a door or close: ring the kitchen bell
      if ((b.chefDoor || (b.chefAwake && K.chefBellEarly)) && o.circuits.C7 && !disable.bell && t >= (m.lureReady || 0) && t - (m.bellAt || -99) > 12) {
        m.bellAt = t;
        m.lureReady = t + 3.1;
        m.handled.chef = t;
        return { type: 'cmd', name: 'lure', args: { room: '05' } };
      }

      // Sunny at the left door: hold the light on it
      if (b.sunnyDoor && !disable.doorLight) {
        if (!o.doors.L.lit && !o.doors.L.broken && !o.doors.L.stuck) {
          m.lightOffAt.L = t + K.lightHold;
          m.handled.sunny = t;
          return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
        }
        if (o.doors.L.lit) m.handled.sunny = t;
      }

      // Pip at the right door: light stalls it, a lure sends it away
      if (b.pipDoor && !o.doors.R.lit && !o.doors.R.broken && !o.doors.R.stuck && !o.doors.R.hot && !disable.doorLight && !disable.pipLight) {
        m.lightOffAt.R = t + 5;
        return { type: 'cmd', name: 'doorLight', args: { side: 'R', on: true } };
      }
      if (b.pipDoor && canLure) {
        const room = this.pickLure(PIP_LURES_DOOR, m, o);
        if (room) {
          m.lureReady = t + 3.1;
          m.handled.pip = t;
          return { type: 'cmd', name: 'lure', args: { room } };
        }
      }
      // both doors busy: freeze Sunny in its corridor for a few seconds
      if (K.roomFreeze && b.pipDoor && b.sunnyNear && !disable.roomLight && t >= m.freezeUntil) {
        m.freezeUntil = t + 12;
        m.freezeOff = t + 10;
        return { type: 'cmd', name: 'roomLight', args: { room: '07', on: true } };
      }
      if (m.freezeOff && t >= m.freezeOff) {
        m.freezeOff = 0;
        return { type: 'cmd', name: 'roomLight', args: { room: '07', on: false } };
      }
      // Pip in the east hall: drop the shutter so it cannot reach the door
      if (b.pipNear && !b.pipDoor && !o.shutterBusy && o.circuits.C6 && t >= (m.sealRetry || 0) && !disable.seal && (K.sealNear || (K.sealFallback && this.lureBudgetLow(m, o)))) {
        m.sealRetry = t + 4;
        return { type: 'cmd', name: 'seal', args: { room: '08', on: true } };
      }
      // Sunny still at the door with the light already on: keep watching it
      if (b.sunnyDoor && o.doors.L.lit) {
        if (K.confirmLook && o.look !== 'L' && t > m.lightOffAt.L - 1.2) return { type: 'look', dir: 'L' };
        return { type: 'wait', dur: 0.3 };
      }

      // emergencies
      if (o.emergencies) {
        const e = o.emergencies.find((x) => x.id === 'E-1');
        if (e && o.spares > 0) return { type: 'hold', name: 'replaceBulb', args: { side: e.side }, dur: 4 };
      }

      // environment: noise vs heat, light vs heat
      if (disable.heat && o.office.fan) return { type: 'cmd', name: 'fan', args: { on: false } };
      if (m.quiet && o.night >= 2 && o.office.fan && !disable.quiet && (!K.heatMgmt || (o.temp !== undefined && o.temp < 30.6))) {
        return { type: 'cmd', name: 'fan', args: { on: false } };
      }
      if (K.heatMgmt && !disable.heat && o.temp !== undefined && o.temp >= 31.6 && !o.office.fan) {
        return { type: 'cmd', name: 'fan', args: { on: true } };
      }
      if (K.dim && !disable.dim && o.office.light === 2 && o.night >= 2) return { type: 'cmd', name: 'officeLight', args: { level: 1 } };
      if (K.degauss && !disable.degauss && o.magnet !== undefined && o.magnet > 0.6 && !b.pipDoor && !b.pipNear) return { type: 'cmd', name: 'degauss' };

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

      // periodic glance at the left door when nothing has been heard
      if (K.checkEvery && t - m.lastCheck > K.checkEvery && !disable.doorLight) {
        m.lastCheck = t;
        if (!o.doors.L.lit && !o.doors.L.broken && !o.doors.L.hot) {
          m.lightOffAt.L = t + 1.6;
          return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
        }
      }

      // otherwise: work on whatever task is open
      const task = o.tasks.find((x) => !x.done && x.open);
      if (task) return { type: 'task', id: task.id, dur: Math.min(K.chunk, task.need - task.progress + 0.05) };
      return { type: 'wait', dur: 0.5 };
    },
  };
}
