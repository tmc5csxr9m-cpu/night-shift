#!/usr/bin/env node
// Quick parameter sweep: node balance/sweep.js --night 2 --bots B2,B3 --runs 400 '{"nights":{"2":{"reserve":66}}}' '{...}'
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { mergeParams } from '../src/sim/params.js';

const argv = process.argv.slice(2);
const opt = {};
const variants = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
  else variants.push(JSON.parse(argv[i]));
}
const night = Number(opt.night || 1);
const bots = (opt.bots || 'B2,B3,B4').split(',');
const runs = Number(opt.runs || 400);
const base = existsSync('balance/balance.config.json') ? JSON.parse(readFileSync('balance/balance.config.json', 'utf8')) : {};
if (!variants.length) variants.push({});

async function play(botName, params) {
  const workers = Math.max(1, cpus().length - 1);
  const seeds = Array.from({ length: runs }, (_, i) => 1000 + i);
  const chunks = Array.from({ length: workers }, (_, w) => seeds.filter((_, i) => i % workers === w)).filter((c) => c.length);
  const res = (await Promise.all(chunks.map((c) => new Promise((ok, no) => {
    const wk = new Worker(new URL('./worker.js', import.meta.url), { workerData: { night, botName, seeds: c, params } });
    wk.on('message', ok);
    wk.on('error', no);
  })))).flat();
  const wins = res.filter((r) => r.outcome === 'win');
  const pw = wins.map((r) => r.power).sort((a, b) => a - b);
  const causes = {};
  for (const r of res) if (r.outcome !== 'win') causes[r.cause || r.outcome] = (causes[r.cause || r.outcome] || 0) + 1;
  return `${(wins.length / runs * 100).toFixed(1)}% pw~${pw.length ? pw[pw.length >> 1].toFixed(0) : '-'} ${JSON.stringify(causes)}`;
}

for (const v of variants) {
  const params = mergeParams(base, v);
  const out = [];
  for (const b of bots) out.push(`${b} ${await play(b, params)}`);
  console.log(JSON.stringify(v), '\n   ', out.join(' | '));
}
