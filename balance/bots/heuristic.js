// Rule-based player. Beliefs come from what the agent perceived (heard
// cues, door glances, CRT edge interference); the oracle variant reads the
// true world state instead but keeps the same human timing.
//
// Profiles describe how much of the toolbox a player of that level uses.

const PROFILES = {
  novice: {
    lockBreakers: false, genAt: 20, preVent: false, windAt: 0.2, hangUp: 0.5, preLock: false, backQuiet: false, lockHold: 6,
    quietChance: 0.4, checkEvery: 0, useEmi: true, lightHold: 3.4, chunk: 7, careBulbs: false, confirmLook: false,
    sealNear: false, sealFallback: false, heatMgmt: false, dim: false, degauss: false, roomFreeze: false,
    stageCut: false, preLure: false, chefBellEarly: false,
  },
  average: {
    lockBreakers: false, genAt: 30, preVent: false, windAt: 0.4, hangUp: 1, preLock: false, backQuiet: false, lockHold: 5.5,
    quietChance: 1, checkEvery: 30, useEmi: true, lightHold: 3.0, chunk: 4.5, careBulbs: true, confirmLook: false,
    sealNear: true, sealFallback: true, heatMgmt: true, dim: false, degauss: true, roomFreeze: false,
    stageCut: false, preLure: false, chefBellEarly: false,
  },
  expert: {
    lockBreakers: true, genAt: 40, preVent: true, windAt: 0.5, hangUp: 1, preLock: true, backQuiet: true, lockHold: 5,
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
      const b = { sunnyDoor: false, sunnyNear: false, pipDoor: false, pipNear: false, pipFar: false, tootie: false, chefDoor: null, chefAwake: false, backDoor: false, backNear: false, ribbonVent: false, ribbonNear: false };
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
          if (a.id === 'back') {
            b.backDoor = a.node === 'DOOR_B';
            b.backNear = a.node === '12';
          }
          if (a.id === 'ribbon') {
            b.ribbonVent = a.node === 'VENT';
            b.ribbonNear = a.node === 'D2' || a.node === 'D1';
          }
        }
        return b;
      }
      for (const c of o.heard) {
        if (t - c.t > 12) continue;
        // "at the door" needs fresh evidence: the window is only a few seconds
        const fresh = t - c.t < 6;
        if (m.handled[c.source] && c.t <= m.handled[c.source]) continue;
        const src = c.source;
        if (src === 'sunny' || (src === '?' && c.side === 'L')) {
          if ((c.kind === 'greet' || c.db >= 48) && fresh) b.sunnyDoor = true;
          else if (c.db >= 42) b.sunnyNear = true;
        }
        if (src === 'pip' || (src === '?' && c.side === 'R')) {
          if ((c.kind === 'greet' || c.db >= 47) && fresh) b.pipDoor = true;
          else if (c.db >= 41) b.pipNear = true;
          else if (c.db >= 33) b.pipFar = true;
        }
        if (src === 'tootie') b.tootie = true;
        if (src === 'ribbon' || (src === '?' && c.side === 'T')) {
          if ((c.kind === 'greet' || c.db >= 45) && fresh) b.ribbonVent = true;
          else if (c.db >= 33) b.ribbonNear = true;
        }
        if (src === 'back' || (src === '?' && c.side === 'B')) {
          if ((c.kind === 'greet' || c.db >= 48) && fresh) b.backDoor = true;
          else if (c.db >= 40) b.backNear = true;
        }
        if (src === 'chef') {
          b.chefAwake = true;
          if (c.kind === 'greet') b.chefDoor = c.side === 'L' || c.side === 'R' ? c.side : 'L';
        }
      }
      // remember an awake chef for a while (it is slow)
      if (b.chefAwake) m.chefSeen = t;
      if (b.backNear || b.backDoor) m.backHeardAt = t;
      if (m.chefSeen && t - m.chefSeen < 40) b.chefAwake = true;
      if (t - o.seenAt.T <= 2) for (const s of o.seen.T || []) (s.node === 'VENT' ? (b.ribbonVent = true) : (b.ribbonNear = true));
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
        if (o.emi.B > 0.45) b.backDoor = true;
        else if (o.emi.B > 0) b.backNear = true;
        if (o.emi.T > 0.35) b.ribbonVent = true;
        else if (o.emi.T > 0) b.ribbonNear = true;
      }
      if (!o.musicPlaying) b.tootie = true;
      return b;
    },

    interrupt(o, agent) {
      const b = this.beliefs(o, agent);
      return b.sunnyDoor || b.pipDoor || b.tootie || b.chefDoor || b.backDoor || b.ribbonVent || (o.emergencies && o.emergencies.some((e) => e.id === 'E-1' || e.id === 'E-4'));
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
      const doorBusy = b.pipDoor || b.sunnyDoor || b.backDoor || !!b.chefDoor || b.ribbonVent;

      if (o.tripped) return { type: 'cmd', name: 'resetMain' };
      // close to the trip limit: shed load before a door light trips the main breaker
      if (o.power && o.power.load > 8.4 && !disable.shed && t - (m.shedAt || -99) > 3) {
        m.shedAt = t;
        if (o.circuits.C9) return { type: 'cmd', name: 'breaker', args: { id: 'C9', on: false } };
        if (o.office.vent > 1) return { type: 'cmd', name: 'vent', args: { level: 1 } };
        if (o.office.fan) return { type: 'cmd', name: 'fan', args: { on: false } };
      }

      // ---- 1. Pip at the right door (shortest window): light stalls it, a lure sends it away
      if (b.pipDoor && !o.doors.R.lit && !o.doors.R.broken && !o.doors.R.stuck && !o.doors.R.hot && !disable.doorLight && !disable.pipLight) {
        m.lightOffAt.R = t + 5;
        return { type: 'cmd', name: 'doorLight', args: { side: 'R', on: true } };
      }
      // ---- 2. Sunny at the left door: hold the light on it
      if (b.sunnyDoor && !disable.doorLight && !o.doors.L.lit && !o.doors.L.broken && !o.doors.L.stuck) {
        m.lightOffAt.L = t + K.lightHold;
        m.handled.sunny = t;
        return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
      }
      if (b.sunnyDoor && o.doors.L.lit) m.handled.sunny = t;
      // ---- 3. the back door: lock it
      if (b.backDoor && !o.office.maglock && !o.office.coilLockout && o.circuits.C8 && !disable.maglock) {
        m.lockOffAt = t + K.lockHold;
        m.handled.back = t;
        return { type: 'cmd', name: 'maglock', args: { on: true } };
      }
      if (b.pipDoor && canLure) {
        // map locked (STARLIGHT): the hotbar replays the last lure
        if (o.pageLock === 'map') {
          m.lureReady = t + 3.1;
          m.handled.pip = t;
          return { type: 'cmd', name: 'lureRepeat' };
        }
        const room = this.pickLure(PIP_LURES_DOOR, m, o);
        if (room) {
          m.lureReady = t + 3.1;
          m.handled.pip = t;
          return { type: 'cmd', name: 'lure', args: { room } };
        }
      }
      // ---- 3b. Ribbon at the vent: full airflow blows it back
      if ((b.ribbonVent || (b.ribbonNear && K.preVent)) && o.office.vent < 3 && o.circuits.C4 && !disable.vent) {
        m.ventUntil = t + 6;
        return { type: 'cmd', name: 'vent', args: { level: 3 } };
      }
      if (b.ribbonVent && o.office.vent >= 3) m.ventUntil = Math.max(m.ventUntil || 0, t + 3);
      // ---- 4. Chef at a door (or awake, for experts): the kitchen bell
      if ((b.chefDoor || (b.chefAwake && K.chefBellEarly && !doorBusy)) && o.circuits.C7 && !disable.bell && t >= (m.lureReady || 0) && t - (m.bellAt || -99) > 12) {
        m.bellAt = t;
        m.lureReady = t + 3.1;
        m.handled.chef = t;
        return { type: 'cmd', name: 'lure', args: { room: '05' } };
      }
      // ---- 4b. STARLIGHT is about to take a breaker: write-protect it
      if (K.lockBreakers && o.bossPending && !disable.lockBreaker) {
        const l = o.locks?.[o.bossPending];
        if (!(l && (l.t > 0 || l.cd > 0)) && t - (m.lockTry || -99) > 2) {
          m.lockTry = t;
          return { type: 'cmd', name: 'lockBreaker', args: { id: o.bossPending } };
        }
      }
      // ---- 5. music box
      if (b.tootie) {
        if (!o.circuits.C7) return { type: 'cmd', name: 'breaker', args: { id: 'C7', on: true } };
        if (o.focused && o.wind !== undefined && o.wind < 0.35) return { type: 'hold', name: 'wind', dur: 2 };
      }
      // both doors busy: freeze Sunny in its corridor for a few seconds
      if (K.roomFreeze && b.pipDoor && b.sunnyNear && !disable.roomLight && t >= m.freezeUntil) {
        m.freezeUntil = t + 12;
        m.freezeOff = t + 10;
        return { type: 'cmd', name: 'roomLight', args: { room: '07', on: true } };
      }

      // ---- 6. releases (heat / power / coil)
      for (const side of ['L', 'R']) {
        const holding = side === 'L' ? b.sunnyDoor : b.pipDoor;
        if (o.doors[side].on && t >= m.lightOffAt[side] && !(holding && t < m.lightOffAt[side] + 2)) {
          return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
        }
        // protect the bulb, unless something is standing in that door
        if (o.doors[side].on && o.doors[side].hot && K.careBulbs && !holding) return { type: 'cmd', name: 'doorLight', args: { side, on: false } };
      }
      if (o.office.maglock && t >= (m.lockOffAt || 0) && !(b.backDoor && t < (m.lockOffAt || 0) + 1.5)) {
        return { type: 'cmd', name: 'maglock', args: { on: false } };
      }
      if (o.office.vent === 3 && m.ventUntil && t >= m.ventUntil && !b.ribbonVent) {
        m.ventUntil = 0;
        return { type: 'cmd', name: 'vent', args: { level: o.temp !== undefined && o.temp > 32.5 ? 1 : 0 } };
      }
      if (m.freezeOff && t >= m.freezeOff) {
        m.freezeOff = 0;
        return { type: 'cmd', name: 'roomLight', args: { room: '07', on: false } };
      }
      // with the light already holding Sunny, keep an eye on it
      if (b.sunnyDoor && o.doors.L.lit && !b.pipDoor && !b.backDoor) {
        if (K.confirmLook && o.look !== 'L' && t > m.lightOffAt.L - 1.2) return { type: 'look', dir: 'L' };
        return { type: 'wait', dur: 0.3 };
      }

      // ---- 7. prevention
      if (b.pipNear && !b.pipDoor && !o.shutterBusy && o.circuits.C6 && t >= (m.sealRetry || 0) && !disable.seal && (K.sealNear || (K.sealFallback && this.lureBudgetLow(m, o)))) {
        m.sealRetry = t + 4;
        return { type: 'cmd', name: 'seal', args: { room: '08', on: true } };
      }
      if (K.preLock && b.backNear && !doorBusy && !o.office.maglock && !o.office.coilLockout && (o.coil === undefined || o.coil < 0.3) && t >= (m.preLockAt || 0) && !disable.maglock) {
        m.preLockAt = t + 12;
        m.lockOffAt = t + 3;
        return { type: 'cmd', name: 'maglock', args: { on: true } };
      }
      if (o.focused && o.autoWind === false && o.wind !== undefined && o.wind < K.windAt && !doorBusy && !disable.wind) {
        return { type: 'hold', name: 'wind', dur: Math.min(3, (0.95 - o.wind) / 0.25) };
      }
      if (!o.circuits.C0 && !disable.freezer) return { type: 'cmd', name: 'breaker', args: { id: 'C0', on: true } };
      for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']) {
        if (!o.circuits[id] && t - (m.breakerFixAt || -99) > (level === 'novice' ? 15 : 3)) {
          m.breakerFixAt = t;
          return { type: 'cmd', name: 'breaker', args: { id, on: true } };
        }
      }
      if (o.phone === 'ringing' && o.t > 30 && t - (m.hangAt || -99) > 3) {
        m.hangAt = t;
        if (agent.rng.chance(K.hangUp)) return { type: 'cmd', name: 'hangUp' };
      }
      if (o.emergencies) {
        const e = o.emergencies.find((x) => x.id === 'E-1');
        if (e && o.spares > 0) return { type: 'hold', name: 'replaceBulb', args: { side: e.side }, dur: 4 };
      }
      if (doorBusy) return { type: 'wait', dur: 0.2 };
      if (o.offline && o.offline.length && !disable.reboot) return { type: 'hold', name: 'rebootNode', args: { room: o.offline[0] }, dur: 3 };

      // ---- 8. environment: noise vs heat, light vs heat
      if (disable.heat && o.office.fan) return { type: 'cmd', name: 'fan', args: { on: false } };
      // quiet only while the back door is active; otherwise keep the terminal cool
      const backActive = (m.backHeardAt !== undefined && t - m.backHeardAt < 25) || b.backNear;
      const hotAt = K.backQuiet && backActive ? 33 : 31.6;
      if (K.backQuiet && backActive && o.office.fan && o.temp !== undefined && o.temp < hotAt - 0.4 && !disable.quiet) {
        return { type: 'cmd', name: 'fan', args: { on: false } };
      }
      if (m.quiet && o.night >= 2 && o.office.fan && !disable.quiet && (!K.heatMgmt || (o.temp !== undefined && o.temp < 30.6))) {
        return { type: 'cmd', name: 'fan', args: { on: false } };
      }
      if (K.heatMgmt && !disable.heat && o.temp !== undefined && o.temp >= hotAt && !o.office.fan) {
        return { type: 'cmd', name: 'fan', args: { on: true } };
      }
      // dim to save heat/power, except when the vent puppet is around (it hates a bright office)
      if (K.dim && !disable.dim && o.office.light === 2 && o.night >= 2 && o.night < 5) return { type: 'cmd', name: 'officeLight', args: { level: 1 } };
      if (o.night >= 5 && o.office.light < 2 && !disable.bright) return { type: 'cmd', name: 'officeLight', args: { level: 2 } };
      if (K.degauss && !disable.degauss && o.magnet !== undefined && o.magnet > 0.6 && !b.pipNear) return { type: 'cmd', name: 'degauss' };

      // ---- 9. power: cut the stage once it is confirmed empty
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

      // ---- 10. periodic glance at the left door when nothing has been heard
      if (K.checkEvery && t - m.lastCheck > K.checkEvery && !disable.doorLight) {
        m.lastCheck = t;
        if (!o.doors.L.lit && !o.doors.L.broken && !o.doors.L.hot) {
          m.lightOffAt.L = t + 1.6;
          return { type: 'cmd', name: 'doorLight', args: { side: 'L', on: true } };
        }
      }

      // ---- 11. work: emergency tasks first, then whatever is open
      // (never start a task chunk that would be interrupted right away)
      if (this.interrupt(o, agent)) return { type: 'wait', dur: 0.3 };
      // the generator is loud: only fire it up when the battery is really running low
      const wantGen = (x) => x.id !== 'T-06' || (o.power && (o.power.pct < K.genAt || o.power.load > 8.2));
      const task = o.tasks.find((x) => !x.done && x.open && x.optional && wantGen(x)) || o.tasks.find((x) => !x.done && x.open && !x.optional);
      if (task) return { type: 'task', id: task.id, dur: Math.min(K.chunk, task.need - task.progress + 0.05) };
      return { type: 'wait', dur: 0.5 };
    },
  };
}
