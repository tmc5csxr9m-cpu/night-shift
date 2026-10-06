// Hard gates from GAME_PLAN 11.5. Ranges are [min, max] win rates.
export const WIN_TARGETS = {
  // v3: the whole game is hard; the expert (B4) wins under 20% on N6.
  // B2 (novice model) is a sanity check: it must sit well below B3.
  // B5 (oracle) floors prove every night stays winnable with good play.
  1: { B0: [0, 0.05], B2: [0.10, 0.60], B3: [0.72, 0.87], B4: [0.88, 0.98], B5: [0.97, 1], X: [0, 0.10] },
  2: { B0: [0, 0.01], B2: [0, 0.40], B3: [0.55, 0.72], B4: [0.80, 0.93], B5: [0.95, 1], X: [0, 0.05] },
  3: { B0: [0, 0.01], B2: [0, 0.15], B3: [0.25, 0.42], B4: [0.66, 0.80], B5: [0.90, 1], X: [0, 0.05] },
  4: { B0: [0, 0.01], B2: [0, 0.08], B3: [0.12, 0.26], B4: [0.50, 0.65], B5: [0.85, 1], X: [0, 0.05] },
  5: { B0: [0, 0.01], B2: [0, 0.03], B3: [0.04, 0.14], B4: [0.32, 0.46], B5: [0.75, 1], X: [0, 0.03] },
  6: { B0: [0, 0.01], B2: [0, 0.02], B3: [0, 0.06], B4: [0.10, 0.19], B5: [0.45, 1], X: [0, 0.02] },
};

// a "trick" on top of the expert may not add more than this to its win rate
export const TRICK_MARGIN = 0.05;

// mechanic ablations: [bot, disabled, kind]
//   counter: B3 win rate must drop >= 30pp
//   tradeoff: B4 win rate must drop 3..15pp
export const ABLATIONS = {
  1: [['B3', 'doorLight', 'counter']],
  2: [['B3', 'doorLight', 'counter'], ['B3', 'lure', 'counter']],
};

export const MIN_WARN_LEAD = 0.45 + 1.0 + 0.5;   // reaction + fastest counter + margin
