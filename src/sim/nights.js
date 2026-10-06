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
    broken: 'lure',
  },
  3: {
    name: '第 3 夜', reserve: 64,
    actors: ['sunny', 'pip', 'back', 'tootie', 'chef'],
    tasks: [['T-03', 0], ['T-04', 1], ['T-01', 3]],
    A: { sunny: [4, 6, 7, 8, 9, 10], pip: [4, 6, 8, 9, 10, 11], back: [2, 4, 6, 7, 8, 9] },
    outside: 30.0, spares: 2, bulbsBurn: true, autoWind: true, events: true, call: 3,
  },
  4: {
    name: '第 4 夜', reserve: 62,
    actors: ['sunny', 'pip', 'back', 'tootie', 'chef'],
    tasks: [['T-05', 0], ['T-02', 2], ['T-04', 3]],
    A: { sunny: [4, 5, 7, 8, 9, 10], pip: [4, 6, 7, 9, 10, 11], back: [2, 4, 5, 7, 8, 9] },
    outside: 30.0, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.009, events: true, call: 4,
    broken: 'seal',
  },
  5: {
    name: '第 5 夜', reserve: 61,
    actors: ['sunny', 'pip', 'back', 'ribbon', 'tootie', 'chef'],
    tasks: [['T-02', 0], ['T-03', 1], ['T-01', 3]],
    A: { sunny: [2, 3, 4, 5, 5, 6], pip: [2, 3, 4, 5, 6, 6], back: [1, 2, 3, 4, 4, 5], ribbon: [0, 3, 5, 6, 7, 8] },
    outside: 30.7, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.010, events: true, call: 5,
    broken: 'seal', gridFail: 3, gridPenalty: 6,
  },
  6: {
    name: '第 6 夜', reserve: 54, boss: true,
    actors: ['sunny', 'pip', 'back', 'ribbon', 'tootie', 'chef', 'starlight'],
    tasks: [['T-01', 0], ['T-08a', 1], ['T-08b', 2.5], ['T-08c', 4.5]],
    A: { sunny: [3, 4, 5, 5, 6, 7], pip: [3, 4, 5, 6, 6, 6], back: [2, 3, 4, 4, 5, 5], ribbon: [0, 3, 4, 5, 6, 6] },
    outside: 30.0, spares: 2, bulbsBurn: true, autoWind: false, windDrain: 0.011, events: true, call: 6,
  },
};

// tutorial call lengths (seconds) — new threats stay at A=0 until it ends
export const CALL_LENGTH = { 0: 0, 1: 75, 2: 70, 3: 65, 4: 60, 5: 65, 6: 55 };
