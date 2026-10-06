#!/usr/bin/env node
// Average per-night command usage of a bot: node balance/usage.js --night 2 --bot B4 --runs 200
import { readFileSync, existsSync } from 'node:fs';
import { World } from '../src/sim/index.js';
import { playNight } from './agent.js';
import { makeBot } from './bots/index.js';

const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
const night = Number(a.night || 1);
const runs = Number(a.runs || 200);
const params = existsSync('balance/balance.config.json') ? JSON.parse(readFileSync('balance/balance.config.json', 'utf8')) : {};
const tot = {};
let wins = 0;
for (let s = 0; s < runs; s++) {
  const { bot, skill, oracle } = makeBot(a.bot || 'B4');
  const r = playNight(World, { night, seed: 1000 + s, bot, skill, oracle, params });
  if (r.outcome === 'win') wins++;
  for (const [k, v] of Object.entries(r.usage)) tot[k] = (tot[k] || 0) + v;
}
console.log(`${a.bot || 'B4'} N${night} win ${((wins / runs) * 100).toFixed(1)}%`);
for (const [k, v] of Object.entries(tot).sort((x, y) => y[1] - x[1])) console.log(`  ${k.padEnd(14)} ${(v / runs).toFixed(2)}`);
