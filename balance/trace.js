#!/usr/bin/env node
// Print the last moments of a bot's night (actions, moves, cues, deaths).
//   node balance/trace.js --night 2 --bot B3 --seed 1957 [--lines 40]
//   node balance/trace.js --night 2 --bot B4 --cause pip          (first matching death from seed 1000)
import { readFileSync, existsSync } from 'node:fs';
import { World } from '../src/sim/index.js';
import { Agent } from './agent.js';
import { makeBot } from './bots/index.js';

const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
const night = Number(a.night || 1);
const botName = a.bot || 'B3';
const lines = Number(a.lines || 40);
const params = existsSync('balance/balance.config.json') ? JSON.parse(readFileSync('balance/balance.config.json', 'utf8')) : {};
const seeds = a.seed ? [Number(a.seed)] : Array.from({ length: 2000 }, (_, i) => 1000 + i);

for (const seed of seeds) {
  const w = new World({ night, seed, params });
  const { bot, skill, oracle } = makeBot(botName);
  const ag = new Agent(w, bot, { skill, seed, oracle });
  bot.reset?.(ag);
  const out = [];
  const st = ag.start.bind(ag);
  ag.start = (act) => {
    if (act.type !== 'wait') out.push(`${w.t.toFixed(1).padStart(6)}   >> ${JSON.stringify(act)}`);
    st(act);
  };
  w.on((e) => {
    if (e.type === 'cue') out.push(`${e.t.toFixed(1).padStart(6)} cue  ${e.source} ${e.node} ${e.db}dB p=${e.p.toFixed(2)} ${e.kind}`);
    else if (!['log', 'cmd'].includes(e.type)) {
      const d = { ...e };
      delete d.type;
      delete d.t;
      out.push(`${e.t.toFixed(1).padStart(6)} ${e.type} ${JSON.stringify(d)}`);
    }
  });
  while (!w.result) {
    w.tick();
    ag.step();
  }
  const r = w.result;
  if (a.seed || (r.outcome !== 'win' && (!a.cause || (r.cause || r.outcome) === a.cause))) {
    console.log(`seed ${seed}  →  ${r.outcome} ${r.cause || ''} @ ${r.clock}`);
    console.log(out.slice(-lines).join('\n'));
    break;
  }
}
