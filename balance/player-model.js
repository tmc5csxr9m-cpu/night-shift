// Human player model: timing, perception and error rates per skill level.
// Initial values from the plan (11.3); to be calibrated with real play data.

export const SKILLS = {
  novice: {
    reaction: 0.65, reactionSigma: 0.35, turn: 0.75, focus: 0.55, page: 0.4, click: 0.55, misclick: 0.06,
    taskMul: 1.4, hearOffset: 3, emiThreshold: 0.6, emiNotice: 0.25, mapFind: 0.6, taskDeaf: 6, think: [0.25, 0.6], taskChunk: [5, 9], apm: 20,
  },
  average: {
    reaction: 0.45, reactionSigma: 0.3, turn: 0.6, focus: 0.5, page: 0.35, click: 0.45, misclick: 0.03,
    taskMul: 1.0, hearOffset: 0, emiThreshold: 0.4, emiNotice: 0.5, mapFind: 0.4, taskDeaf: 3, think: [0.15, 0.4], taskChunk: [3, 6], apm: 30,
  },
  expert: {
    reaction: 0.32, reactionSigma: 0.25, turn: 0.45, focus: 0.45, page: 0.3, click: 0.35, misclick: 0.01,
    taskMul: 0.75, hearOffset: -2, emiThreshold: 0.2, emiNotice: 1.0, mapFind: 0.25, taskDeaf: 1, think: [0.08, 0.2], taskChunk: [2, 4], apm: 45,
  },
};

// seconds a human needs for each required task (min, max) at skill 1.0
export const TASK_TIME = {
  'T-01': [25, 40], 'T-02': [15, 25], 'T-03': [15, 30], 'T-04': [20, 35],
  'T-05': [20, 30], 'T-06': [8, 15], 'T-07': [20, 30], 'T-08': [70, 85],
};

// which terminal page a command lives on (null = hotbar / status bar)
export const CMD_PAGE = {
  doorLight: null, maglock: null, degauss: null, answerPhone: null, hangUp: null,
  scan: 'map', lure: 'map', roomLight: 'map', seal: 'map',
  breaker: 'power', resetMain: 'power',
  officeLight: 'facility', fan: 'facility', vent: 'facility', wind: 'facility', replaceBulb: 'facility', oscillate: 'facility',
  taskComplete: 'tasks',
};
