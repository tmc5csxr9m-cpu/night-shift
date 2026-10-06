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

  temp: { equipment: 2.0, lightPerLevel: 0.15, ventK: 0.22, fan: 1.0, fanTau: 20, tau: 40, fault: 32, shutdown: 36, rebootTime: 8 },

  noise: {
    base: 30, fan: 38, ventPerLevel: 4, generator: 42, phone: 40, degauss: 45, degaussTime: 1.0, musicBox: 32,
    pipPerDb: 7, pipMax: 3,
  },

  hearing: { offset: 6, slope: 3 },

  emi: { door: 1.0, adjacent: 0.35, magnetRate: 0.04, degaussCooldown: 4, pulse: 0.35,
    strength: { sunny: 1.0, pip: 0.7, tootie: 0.85, back: 0.9, chef: 1.0, ribbon: 0.6 } },

  scan: { time: 2.0, cooldown: 6, accuracy: 0.8, accuracyCalibrated: 0.98 },

  seal: { maxTime: 20, cooldown: 15 },

  // an unlit office emboldens these actors (+A)
  darkBonus: { sunny: 2, pip: 2, chef: 2, ribbon: 3 },
  // ...and quicker at the door
  darkAttack: 0.75,

  lure: { duration: 7, range: 2, decay: 0.5, minDuration: 1.5 },

  // while an actor waits at a door it keeps making noise (greeting / knocking)
  doorCueEvery: 2.5,

  maglock: { maxLock: 18, lockout: 20, giveUp: 4 },

  musicBox: { windRate: 0.25, resumeAt: 0.3 },

  actors: {
    sunny: { interval: 5.0, attackDelay: [6.5, 5.8, 6, 5.8, 6, 6], retreatLight: 2.5, rageRate: 1, rageDiv: 4, rageTime: 30, freezeMax: 15, stageOn: -4, stageOff: 2 },
    pip: { interval: 3.5, attackDelay: [4.6, 4.8, 4.4, 4.3, 4.7, 4.2], litSlow: 0.2, poseMax: 10, lureHesitate: 0.8, impatienceDiv: 10, stageOn: -4, stageOff: 2 },
    tootie: { stepTime: 6.5, attackDelay: 4, returnStep: 2.5 },
    back: { interval: 6, attackDelay: [7, 7, 5.5, 6, 6, 5], generator: 2, noiseFrom: 32, noisePerDb: 3, noiseMax: 3 },
    ribbon: { interval: 5, attackDelay: [7, 7, 7, 7, 7, 6.5], ventMod: -4, brightMod: -2, blowTime: 3 },
    starlight: { breakerGap: [25, 40], breakerWarn: 3, extraLoad: 2.5, pageLock: 20, ventHijack: 15, paJam: 12, paGap: [35, 50], attackGap: 14, telegraph: 3 },
    chef: { interval: 8, moveChance: 0.55, attackDelay: 10, thawRate: 1.0, refreeze: 0.5, dormantAt: 60, returnStep: 4 },
  },

  // footsteps / greeting loudness at the player's ears, by actor node
  cues: {
    sunny: { '02': 32, '07F': 38, '07N': 44, DOOR_L: 50 },
    pip: { '02': 30, '06': 30, '11': 33, '08F': 37, '08N': 43, DOOR_R: 48 },
    tootie: { '11': 36, '08F': 42, '08N': 47, DOOR_R: 52 },
    back: { BACKP: 32, '12': 38, DOOR_B: 46 },
    ribbon: { D1: 34, D2: 40, VENT: 46 },
    chef: { '06': 34, '02': 36, '11': 36, '07F': 40, '07N': 46, DOOR_L: 50, '08F': 40, '08N': 46, DOOR_R: 50 },
  },

  events: { meanGap: 70, relayStuck: 1, drift: 1, aging: 1 },

  call: { ringTime: 6, spamRing: 15 },

  generator: { duration: 150, magnet: 0.012, batteryMul: 1.2 },

  boss: { lockTime: 45, lockCooldown: 30, scanLie: 0.3 },
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
