import { heuristicBot } from './heuristic.js';

const ROOMS = ['01', '02', '03', '05', '06', '07', '08', '11', '13'];

export function idleBot() {
  return { name: 'B0', decide: () => ({ type: 'wait', dur: 1 }) };
}

// random legal actions at a human pace
export function randomBot() {
  return {
    name: 'B1',
    decide(o, agent) {
      const r = agent.rng;
      switch (r.int(9)) {
        case 0: return { type: 'cmd', name: 'doorLight', args: { side: r.chance(0.5) ? 'L' : 'R' } };
        case 1: return { type: 'look', dir: r.pick(['L', 'R', 'F']) };
        case 2: return { type: 'cmd', name: 'lure', args: { room: r.pick(ROOMS) } };
        case 3: return { type: 'cmd', name: 'scan', args: { room: r.pick(ROOMS) } };
        case 4: return { type: 'cmd', name: 'roomLight', args: { room: r.pick(ROOMS) } };
        case 5: return { type: 'cmd', name: 'seal', args: { room: r.pick(ROOMS) } };
        case 6: return { type: 'cmd', name: 'breaker', args: { id: r.pick(['C1', 'C4', 'C5', 'C6', 'C7', 'C9', 'C0']) } };
        case 7: {
          const t = o.tasks.find((x) => !x.done && x.open);
          return t ? { type: 'task', id: t.id, dur: 4 } : { type: 'wait', dur: 1 };
        }
        default: return { type: 'wait', dur: r.range(0.5, 3) };
      }
    },
  };
}

const task = (o, dur = 5) => {
  const t = o.tasks.find((x) => !x.done && x.open);
  return t ? { type: 'task', id: t.id, dur } : { type: 'wait', dur: 1 };
};

// X-*: one strategy and nothing else. Must lose.
export function exploitBot(kind) {
  if (kind === 'terminalOnly') return terminalOnlyBot();
  const base = heuristicBot('average');
  return {
    name: 'X-' + kind,
    reset: base.reset,
    decide(o, agent) {
      switch (kind) {
        case 'lightsOn': {
          for (const s of ['L', 'R']) if (!o.doors[s].on && !o.doors[s].broken) return { type: 'cmd', name: 'doorLight', args: { side: s, on: true } };
          const e = o.emergencies?.find((x) => x.id === 'E-1');
          if (e && o.spares > 0) return { type: 'hold', name: 'replaceBulb', args: { side: e.side }, dur: 4 };
          return task(o);
        }
        case 'lureSpam':
          if (o.calibrated.lure) return { type: 'cmd', name: 'lure', args: { room: agent.rng.pick(['06', '11', '02', '08', '13']) } };
          return task(o);
        case 'noTasks': {
          const a = base.decide(o, agent);
          return a && a.type === 'task' ? { type: 'wait', dur: 1 } : a;
        }
        case 'lateTasks': {
          const a = base.decide(o, agent);
          return a && a.type === 'task' && o.t < 520 ? { type: 'wait', dur: 1 } : a;
        }
        case 'sealAll': {
          const m = agent.mem;
          m.si = ((m.si || 0) + 1) % 2;
          return { type: 'cmd', name: 'seal', args: { room: m.si ? '07' : '08', on: true } };
        }
        default:
          return base.decide(o, agent);
      }
    },
  };
}

// T-*: an expert player plus one "clever" trick. If a trick adds a lot of
// win rate on top of the expert, it is a dominant strategy and must be fixed.
export function trickBot(kind) {
  const off = { pipLightOnly: { lure: true }, freezerOff: { freezer: true }, fanOff: { heat: true }, dark: { dim: true, heat: true, bright: true }, darkP4: { bright: true }, ventMax: { vent: true } }[kind] || {};
  const base = heuristicBot('expert', { disable: off });
  return {
    name: 'T-' + kind,
    reset: base.reset,
    interrupt: base.interrupt.bind(base),
    decide(o, agent) {
      const m = agent.mem;
      switch (kind) {
        case 'roomFreeze':
          // keep the dining room and west hall lit all night: Sunny never moves?
          if (o.focused || o.t > 2) {
            m.rf = m.rf || {};
            for (const r of ['02', '07']) {
              if (!m.rf[r] || o.t - m.rf[r] > 60) {
                m.rf[r] = o.t;
                return { type: 'cmd', name: 'roomLight', args: { room: r, on: true } };
              }
            }
          }
          break;
        case 'dark':
          if (o.office.light !== 0) return { type: 'cmd', name: 'officeLight', args: { level: 0 } };
          if (o.office.fan) return { type: 'cmd', name: 'fan', args: { on: false } };
          break;
        case 'stageEarly':
          if (o.circuits.C9) return { type: 'cmd', name: 'breaker', args: { id: 'C9', on: false } };
          break;
        case 'freezerOff':
          if (o.circuits.C0) return { type: 'cmd', name: 'breaker', args: { id: 'C0', on: false } };
          break;
        case 'turtle':
          if (!o.shutterBusy) {
            m.tt = ((m.tt || 0) + 1) % 2;
            return { type: 'cmd', name: 'seal', args: { room: m.tt ? '07' : '08', on: true } };
          }
          break;
        case 'fanOff':
          if (o.office.fan) return { type: 'cmd', name: 'fan', args: { on: false } };
          break;
        case 'ventMax':
          if (o.office.vent < 3 && o.circuits.C4) return { type: 'cmd', name: 'vent', args: { level: 3 } };
          break;
        case 'genEarly': {
          const g = o.tasks.find((x) => x.id === 'T-06' && !x.done && x.open);
          if (g) return { type: 'task', id: 'T-06', dur: 4 };
          break;
        }
        case 'darkP4':
          if (o.bossPhase === 4 && o.office.light !== 0) return { type: 'cmd', name: 'officeLight', args: { level: 0 } };
          break;
        default:
      }
      return base.decide(o, agent);
    },
  };
}

// an expert who never leaves the terminal: everything from the keyboard,
// lights from the hotbar, never turns round, never touches the shelf or phone
function terminalOnlyBot() {
  const base = heuristicBot('expert');
  return {
    name: 'X-terminalOnly',
    reset: base.reset,
    interrupt: base.interrupt.bind(base),
    decide(o, agent) {
      const a = base.decide(o, agent);
      if (!a) return a;
      if (a.type === 'look') return { type: 'wait', dur: 0.3 };
      if (a.type === 'phys') return a.name === 'doorLight' ? { type: 'cmd', name: 'doorLight', args: a.args } : { type: 'wait', dur: 0.3 };
      return a;
    },
  };
}

export const EXPLOITS = ['X-lightsOn', 'X-lureSpam', 'X-noTasks', 'X-lateTasks', 'X-sealAll', 'X-terminalOnly'];
export const TRICKS = ['T-roomFreeze', 'T-dark', 'T-stageEarly', 'T-freezerOff', 'T-turtle', 'T-fanOff', 'T-pipLightOnly', 'T-ventMax', 'T-genEarly', 'T-darkP4'];

export function makeBot(name) {
  switch (name) {
    case 'B0': return { bot: idleBot(), skill: 'average' };
    case 'B1': return { bot: randomBot(), skill: 'average' };
    case 'B2': return { bot: heuristicBot('novice'), skill: 'novice' };
    case 'B3': return { bot: heuristicBot('average'), skill: 'average' };
    case 'B4': return { bot: heuristicBot('expert'), skill: 'expert' };
    case 'B5': return { bot: heuristicBot('expert', { oracle: true }), skill: 'expert', oracle: true };
    default:
      if (name.startsWith('X-')) return { bot: exploitBot(name.slice(2)), skill: 'average' };
      if (name.startsWith('T-')) return { bot: trickBot(name.slice(2)), skill: 'expert' };
      if (name.includes('!')) {
        // ablation: B3!lure, B4!stageCut ...
        const [b, off] = name.split('!');
        const level = { B2: 'novice', B3: 'average', B4: 'expert' }[b];
        return { bot: heuristicBot(level, { disable: { [off]: true } }), skill: level };
      }
      throw new Error('unknown bot ' + name);
  }
}
