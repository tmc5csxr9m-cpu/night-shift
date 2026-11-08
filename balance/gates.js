// Hard gates from GAME_PLAN 11.5. Ranges are [min, max] win rates.
export const WIN_TARGETS = {
  // v3: the whole game is hard; the expert (B4) wins under 20% on N6.
  // B2 (novice model) is a sanity check: it must sit well below B3.
  // B5 (oracle) floors prove every night stays winnable with good play.
  // v3.1: after fixing the expert bot's fan bug (it ran the terminal hot) the
  // expert's skill ceiling is much higher than the v3 bands assumed; the curve
  // is now set by B3 (average) and the hard N6 limit (B4 < 20%).
  // N1/N2 B4 ceilings: the expert's reaction time beats the early windows;
  // tightening them further only punishes B2/B3 (see 11.5c), so the early
  // curve is set by B3 and the expert is allowed to be near-perfect.
  1: { B0: [0, 0.05], B2: [0.10, 0.60], B3: [0.72, 0.87], B4: [0.88, 1], B5: [0.97, 1], X: [0, 0.10] },
  2: { B0: [0, 0.01], B2: [0, 0.40], B3: [0.55, 0.72], B4: [0.80, 0.99], B5: [0.95, 1], X: [0, 0.05] },
  3: { B0: [0, 0.01], B2: [0, 0.15], B3: [0.20, 0.42], B4: [0.78, 0.94], B5: [0.90, 1], X: [0, 0.05] },
  4: { B0: [0, 0.01], B2: [0, 0.08], B3: [0.10, 0.26], B4: [0.66, 0.88], B5: [0.85, 1], X: [0, 0.05] },
  5: { B0: [0, 0.01], B2: [0, 0.03], B3: [0.02, 0.20], B4: [0.50, 0.76], B5: [0.75, 1], X: [0, 0.03] },
  6: { B0: [0, 0.01], B2: [0, 0.02], B3: [0, 0.06], B4: [0.10, 0.195], B5: [0.15, 1], X: [0, 0.02] },
};

// a "trick" on top of the expert may not add more than this to its win rate
export const TRICK_MARGIN = 0.05;

// mechanic ablations: [bot, disabled, kind]
//   counter: win rate must drop >= 30pp (or to under a fifth of the base)
//   used:    win rate must drop >= min(3pp, 15% of the base) — the mechanic
//            pays for its time/power/heat cost; skipping it is not free
export const ABLATIONS = {
  1: [['B3', 'doorLight', 'counter']],
  2: [['B3', 'doorLight', 'counter'], ['B3', 'lure', 'counter']],
  3: [['B3', 'maglock', 'counter'], ['B4', 'heat', 'used'], ['B4', 'seal', 'used']],
  4: [['B4', 'wind', 'counter'], ['B4', 'heat', 'used'], ['B4', 'degauss', 'used'], ['B4', 'seal', 'used']],
  5: [['B4', 'vent', 'counter'], ['B4', 'generator', 'used'], ['B4', 'degauss', 'used'], ['B4', 'heat', 'used'], ['B4', 'bright', 'used'], ['B4', 'seal', 'used'], ['B4', 'stageCut', 'used']],
  6: [['B4', 'wind', 'counter'], ['B4', 'vent', 'counter'], ['B4', 'stageCut', 'used'], ['B4', 'generator', 'used'], ['B4', 'degauss', 'used'], ['B4', 'lockBreaker', 'used'],
    ['B4', 'relure', 'used'], ['B4', 'heat', 'used']],
  // measured but not required (situational, within ±2pp for the bots):
  //   v4: emi (screen interference, deliberately faint), pipLight (staring
  //   Pip down: a fallback when lures are out), preLock, quiet, roomLight,
  //   reboot; stageCut before N5 (power is not tight there); seal and
  //   shed (load shedding) on N6
};

export const MIN_WARN_LEAD = 0.45 + 1.0 + 0.5;   // reaction + fastest counter + margin
