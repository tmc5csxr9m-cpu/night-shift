// Per-night configuration. A tables are aggression per in-game hour (00..05).
// tasks: [id, openHour] — a task can only be completed after it opens, so
// work has to happen while the night is busy, not all at 00:00.

export const NIGHTS = {
  0: {
    name: '空夜', reserve: 100, actors: [], tasks: [], A: {},
    outside: 27, spares: 3, bulbsBurn: true, autoWind: true, events: false, call: 0,
  },
  1: {
    name: '第 1 夜', reserve: 80,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-01', 0], ['T-04', 2]],
    // Pip only wakes up in the second half of the first night
    A: { sunny: [2, 4, 6, 7, 8, 9], pip: [0, 0, 4, 7, 9, 10] },
    outside: 27, spares: 3, bulbsBurn: true, autoWind: true, events: false, call: 1,
  },
  2: {
    name: '第 2 夜', reserve: 64,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-02', 0], ['T-01', 2]],
    A: { sunny: [4, 6, 7, 8, 9, 10], pip: [4, 7, 9, 11, 12, 13] },
    outside: 30.5, spares: 3, bulbsBurn: true, autoWind: true, events: true, call: 2,
    lureNeedsT02: true,
  },
  // N3-N6 receive their new threats in M4-M6; until then they reuse the
  // existing cast so they stay playable.
  3: {
    name: '第 3 夜', reserve: 60,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-03', 0], ['T-04', 1], ['T-01', 3]],
    A: { sunny: [3, 4, 6, 7, 8, 9], pip: [3, 5, 7, 9, 11, 12] },
    outside: 30, spares: 2, bulbsBurn: true, autoWind: true, events: true, call: 3,
  },
  4: {
    name: '第 4 夜', reserve: 58,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-02', 0], ['T-04', 2], ['T-01', 3]],
    A: { sunny: [4, 5, 7, 8, 9, 10], pip: [4, 6, 8, 10, 12, 13] },
    outside: 30.5, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.009, events: true, call: 4,
  },
  5: {
    name: '第 5 夜', reserve: 56,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-03', 0], ['T-01', 2], ['T-02', 3]],
    A: { sunny: [5, 6, 8, 9, 11, 12], pip: [5, 7, 9, 11, 13, 14] },
    outside: 33, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.010, events: true, call: 5,
  },
  6: {
    name: '第 6 夜', reserve: 54,
    actors: ['sunny', 'pip', 'tootie', 'chef'],
    tasks: [['T-01', 0], ['T-02', 2], ['T-03', 4]],
    A: { sunny: [6, 7, 9, 10, 12, 13], pip: [6, 8, 10, 12, 14, 15] },
    outside: 31, spares: 1, bulbsBurn: true, autoWind: false, windDrain: 0.012, events: true, call: 6,
  },
};

// tutorial call lengths (seconds) — new threats stay at A=0 until it ends
export const CALL_LENGTH = { 0: 0, 1: 75, 2: 70, 3: 65, 4: 60, 5: 65, 6: 55 };
