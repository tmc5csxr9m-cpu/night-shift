import { parentPort, workerData } from 'node:worker_threads';
import { World } from '../src/sim/index.js';
import { playNight } from './agent.js';
import { makeBot } from './bots/index.js';

const { night, botName, seeds, params } = workerData;
const out = [];
for (const seed of seeds) {
  const { bot, skill, oracle } = makeBot(botName);
  out.push({ seed, ...playNight(World, { night, seed, bot, skill, oracle, params }) });
}
parentPort.postMessage(out);
