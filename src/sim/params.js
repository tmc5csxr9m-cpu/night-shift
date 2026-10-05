// Every tunable number of the simulation lives here. The balance tool can
// override any of them (deep-merged) without touching code.

export const DEFAULT_PARAMS = {
  tick: 0.1,                 // seconds per sim step
  nightSeconds: 540,         // 00:00 -> 06:00
  overtimeSeconds: 45,       // 06:00 -> 06:30
  hourSeconds: 90,

  power: {
    base: 0.6, C6: 0.55, C7idle: 0.1, C7play: 0.3, C8: 0.35, C9: 2.4, C0: 1.3,
    officeLight: [0, 0.18, 0.42], doorLight: 0.65, vent: 0.36, fan: 0.08,
    roomLight: 0.3, seal: 0.4, scanCost: 0.2, generator: 3.5,
    tripLimit: 9.5, tripBlackout: 3,
  },

  doorLight: {
    heatOn: 7, coolOff: 4, coolBonusRelays: 1.25, warn: 75,
    stuckTime: 10,
  },

  temp: { equipment: 2.0, lightPerLevel: 0.3, ventK: 0.22, fan: 1.0, tau: 40, fault: 32, shutdown: 36, rebootTime: 8 },

  noise: {
    base: 30, fan: 38, ventPerLevel: 4, generator: 45, phone: 40, degauss: 45, degaussTime: 1.0, musicBox: 32,
    pipPerDb: 6, pipMax: 3,
  },

  hearing: { offset: 6, slope: 3 },

  emi: { door: 1.0, adjacent: 0.35, magnetRate: 0.012, degaussCooldown: 4, pulse: 0.35,
    strength: { sunny: 1.0, pip: 0.7, tootie: 0.85, back: 0.9, chef: 1.0, ribbon: 0.6 } },

  scan: { time: 2.0, cooldown: 6, accuracy: 0.8, accuracyCalibrated: 0.98 },

  seal: { maxTime: 20, cooldown: 10 },

  lure: { duration: 8, range: 2, decay: 0.7, minDuration: 1.5 },

  // while an actor waits at a door it keeps making noise (greeting / knocking)
  doorCueEvery: 2.5,

  maglock: { maxLock: 25, lockout: 15, giveUp: 4 },

  musicBox: { windRate: 0.25, resumeAt: 0.3 },

  actors: {
    sunny: { interval: 5.0, attackDelay: [9, 9, 8, 7, 7, 6], retreatLight: 2.5, rageRate: 1, rageDiv: 5, rageTime: 30, stageOn: -4, stageOff: 2 },
    pip: { interval: 3.5, attackDelay: 5.5, litSlow: 0.2, impatienceDiv: 4, stageOn: -4, stageOff: 2 },
    tootie: { stepTime: 6.5, attackDelay: 4, returnStep: 2.5 },
  },

  // footsteps / greeting loudness at the player's ears, by actor node
  cues: {
    sunny: { '02': 32, '07F': 38, '07N': 44, DOOR_L: 50 },
    pip: { '02': 30, '06': 30, '11': 33, '08F': 37, '08N': 43, DOOR_R: 48 },
    tootie: { '11': 36, '08F': 42, '08N': 47, DOOR_R: 52 },
  },

  events: { meanGap: 70, relayStuck: 1, drift: 1, aging: 1 },

  call: { ringTime: 6 },
};

export function mergeParams(base, over) {
  if (!over) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = mergeParams(base[k], v);
    else out[k] = v;
  }
  return out;
}
