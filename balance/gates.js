// Hard gates from GAME_PLAN 11.5. Ranges are [min, max] win rates.
export const WIN_TARGETS = {
  // v2 (after the first balance runs, see GAME_PLAN 11.5): N1/N2 are onboarding
  // nights, so the average-player band sits higher and the ramp starts at N3.
  1: { B0: [0, 0.30], B2: [0.88, 0.99], B3: [0.95, 1], B4: [0.99, 1], B5: [0.995, 1] },
  2: { B0: [0, 0.01], B2: [0.60, 0.78], B3: [0.92, 0.995], B4: [0.97, 1], B5: [0.995, 1], X: [0, 0.10] },
  3: { B0: [0, 0.01], B2: [0.40, 0.60], B3: [0.78, 0.90], B4: [0.95, 1], B5: [0.995, 1], X: [0, 0.08] },
  4: { B0: [0, 0], B2: [0.25, 0.45], B3: [0.62, 0.78], B4: [0.92, 1], B5: [0.995, 1], X: [0, 0.05] },
  5: { B0: [0, 0], B2: [0.12, 0.30], B3: [0.45, 0.62], B4: [0.88, 1], B5: [0.99, 1], X: [0, 0.05] },
  6: { B0: [0, 0], B2: [0, 0.12], B3: [0.25, 0.40], B4: [0.70, 1], B5: [0.98, 1], X: [0, 0.03] },
};

// mechanic ablations: [bot, disabled, kind]
//   counter: B3 win rate must drop >= 30pp
//   tradeoff: B4 win rate must drop 3..15pp
export const ABLATIONS = {
  1: [['B3', 'doorLight', 'counter']],
  // tradeoff ablations need headroom (B4 < ~97%): they are checked from N3 on,
  // on N1/N2 an expert wins without any optional tool by design
  2: [['B3', 'doorLight', 'counter'], ['B3', 'lure', 'counter']],
};

export const MIN_WARN_LEAD = 0.45 + 1.0 + 0.5;   // reaction + fastest counter + margin
