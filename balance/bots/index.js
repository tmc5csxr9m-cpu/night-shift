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
      const pick = r.int(9);
      switch (pick) {
        case 0: return { type: 'cmd', name: 'doorLight', args: { side: r.chance(0.5) ? 'L' : 'R' } };
        case 1: return { type: 'look', dir: r.pick(['L', 'R', 'F']) };
        case 2: return { type: 'cmd', name: 'lure', args: { room: r.pick(ROOMS) } };
        case 3: return { type: 'cmd', name: 'scan', args: { room: r.pick(ROOMS) } };
        case 4: return { type: 'cmd', name: 'roomLight', args: { room: r.pick(ROOMS) } };
        case 5: return { type: 'cmd', name: 'seal', args: { room: r.pick(ROOMS) } };
        case 6: return { type: 'cmd', name: 'breaker', args: { id: r.pick(['C1', 'C4', 'C5', 'C6', 'C7', 'C9', 'C0']) } };
        case 7: {
          const t = o.tasks.find((x) => !x.done);
          return t ? { type: 'task', id: t.id, dur: 4 } : { type: 'wait', dur: 1 };
        }
        default: return { type: 'wait', dur: r.range(0.5, 3) };
      }
    },
  };
}

// single-strategy exploit probes
export function exploitBot(kind) {
  const base = heuristicBot('average');
  return {
    name: 'X-' + kind,
    reset: base.reset,
    decide(o, agent) {
      if (kind === 'lightsOn') {
        for (const s of ['L', 'R']) if (!o.doors[s].on && !o.doors[s].broken) return { type: 'cmd', name: 'doorLight', args: { side: s, on: true } };
        const e = o.emergencies?.find((x) => x.id === 'E-1');
        if (e && o.spares > 0) return { type: 'hold', name: 'replaceBulb', args: { side: e.side }, dur: 4 };
        const t = o.tasks.find((x) => !x.done);
        return t ? { type: 'task', id: t.id, dur: 5 } : { type: 'wait', dur: 1 };
      }
      if (kind === 'lureSpam') {
        if (o.calibrated.lure) return { type: 'cmd', name: 'lure', args: { room: agent.rng.pick(['06', '11', '02', '08', '13']) } };
        const t = o.tasks.find((x) => !x.done);
        return t ? { type: 'task', id: t.id, dur: 5 } : { type: 'wait', dur: 1 };
      }
      if (kind === 'noTasks') {
        const a = base.decide(o, agent);
        return a && a.type === 'task' ? { type: 'wait', dur: 1 } : a;
      }
      if (kind === 'lateTasks') {
        const a = base.decide(o, agent);
        return a && a.type === 'task' && o.t < 520 ? { type: 'wait', dur: 1 } : a;
      }
      if (kind === 'sealAll') {
        const m = agent.mem;
        m.si = ((m.si || 0) + 1) % 4;
        const room = ['07', '08', '02', '06'][m.si];
        return { type: 'cmd', name: 'seal', args: { room, on: true } };
      }
      return base.decide(o, agent);
    },
  };
}

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
      if (name.includes('!')) {
        // ablation: B3!lure, B4!stageCut ...
        const [b, off] = name.split('!');
        const level = { B2: 'novice', B3: 'average', B4: 'expert' }[b];
        return { bot: heuristicBot(level, { disable: { [off]: true } }), skill: level };
      }
      throw new Error('unknown bot ' + name);
  }
}
