// Per-night configuration. A tables are aggression per in-game hour (00..05).

export const NIGHTS = {
  0: {
    name: '空夜', reserve: 100, actors: [], tasks: [], A: {},
    outside: 27, spares: 3, bulbsBurn: true, autoWind: true, events: false, call: 0,
  },
  1: {
    name: '第 1 夜', reserve: 95,
    actors: ['sunny', 'tootie'],
    tasks: ['T-01', 'T-04'],
    A: { sunny: [0, 2, 3, 4, 5, 6] },
    outside: 27, spares: 0, bulbsBurn: false, autoWind: true, events: false, call: 1,
  },
  2: {
    name: '第 2 夜', reserve: 80,
    actors: ['sunny', 'pip', 'tootie'],
    tasks: ['T-02', 'T-01'],
    A: { sunny: [2, 3, 4, 5, 6, 7], pip: [0, 2, 3, 5, 6, 7] },
    outside: 27, spares: 3, bulbsBurn: true, autoWind: true, events: true, call: 2,
    lureNeedsT02: true,
  },
  // N3-N6 get their new actors in later milestones; until then they reuse
  // what exists so they stay playable.
  3: {
    name: '第 3 夜', reserve: 72,
    actors: ['sunny', 'pip', 'tootie'],
    tasks: ['T-03', 'T-04', 'T-01'],
    A: { sunny: [3, 4, 5, 6, 7, 8], pip: [2, 3, 5, 6, 7, 8] },
    outside: 27, spares: 3, bulbsBurn: true, autoWind: true, events: true, call: 3,
  },
  4: {
    name: '第 4 夜', reserve: 66,
    actors: ['sunny', 'pip', 'tootie'],
    tasks: ['T-02', 'T-04'],
    A: { sunny: [4, 5, 6, 7, 8, 9], pip: [3, 4, 6, 7, 8, 9] },
    outside: 27, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.009, events: true, call: 4,
  },
  5: {
    name: '第 5 夜', reserve: 60,
    actors: ['sunny', 'pip', 'tootie'],
    tasks: ['T-03', 'T-01', 'T-02'],
    A: { sunny: [5, 6, 7, 8, 10, 11], pip: [4, 5, 7, 8, 10, 11] },
    outside: 31, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.010, events: true, call: 5,
  },
  6: {
    name: '第 6 夜', reserve: 56,
    actors: ['sunny', 'pip', 'tootie'],
    tasks: ['T-01', 'T-02', 'T-03'],
    A: { sunny: [6, 7, 8, 9, 10, 11], pip: [5, 6, 8, 9, 10, 11] },
    outside: 28, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.012, events: true, call: 6,
  },
};

// tutorial call lengths (seconds) — new threats stay at A=0 until it ends
export const CALL_LENGTH = { 0: 0, 1: 75, 2: 70, 3: 65, 4: 60, 5: 65, 6: 55 };
