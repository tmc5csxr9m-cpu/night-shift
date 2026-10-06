#!/usr/bin/env node
// Balance runner: plays thousands of nights with bots and checks the gates.
//   node balance/run.js --nights 1-2 --bots B0,B2,B3,B4,B5 --runs 2000 [--ablate] [--exploits]
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { WIN_TARGETS, ABLATIONS, MIN_WARN_LEAD, TRICK_MARGIN } from './gates.js';
import { EXPLOITS, TRICKS } from './bots/index.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null)).filter(Boolean));
const parseNights = (s) => (String(s).includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(String(s).split('-').map(Number)) : String(s).split(',').map(Number));
const nights = parseNights(args.nights || '1-2');
let bots = String(args.bots || 'B0,B1,B2,B3,B4,B5').split(',');
const runs = Number(args.runs || 2000);
const seed0 = Number(args.seed || 1000);
const cfgPath = new URL('./balance.config.json', import.meta.url);
const params = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const cfgHash = createHash('sha1').update(JSON.stringify(params)).digest('hex').slice(0, 10);
let rev = 'nogit';
try {
  rev = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain src balance').toString().trim() ? '+dirty' : '');
} catch { /* no git */ }

function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

async function play(night, botName, n) {
  const workers = Math.max(1, cpus().length - 1);
  const seeds = Array.from({ length: n }, (_, i) => seed0 + i);
  const chunks = Array.from({ length: workers }, (_, w) => seeds.filter((_, i) => i % workers === w)).filter((c) => c.length);
  const results = await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const wk = new Worker(new URL('./worker.js', import.meta.url), { workerData: { night, botName, seeds: c, params } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  return results.flat();
}

function summarize(rs) {
  const n = rs.length;
  const wins = rs.filter((r) => r.outcome === 'win');
  const deaths = rs.filter((r) => r.outcome === 'death');
  const causes = {};
  for (const r of rs) if (r.outcome !== 'win') causes[r.cause || r.outcome] = (causes[r.cause || r.outcome] || 0) + 1;
  const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const early = deaths.filter((r) => r.t < 90).length;
  const bins = new Array(7).fill(0);
  for (const r of deaths) bins[Math.min(6, Math.floor(r.t / 90))]++;
  const unfair = deaths.filter((r) => r.cause !== 'power' && (r.warnLead === null || r.warnLead < MIN_WARN_LEAD));
  const usage = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.usage)) usage[k] = (usage[k] || 0) + v;
  for (const k in usage) usage[k] = +(usage[k] / n).toFixed(2);
  return {
    n,
    win: wins.length / n,
    ci: wilson(wins.length, n),
    causes,
    overtime: rs.filter((r) => r.overtime).length / n,
    fired: rs.filter((r) => r.outcome === 'fired').length / n,
    medianPowerWin: median(wins.map((r) => r.power)),
    earlyDeathShare: deaths.length ? early / deaths.length : 0,
    deathHourBins: bins,
    burnedAvg: rs.reduce((a, r) => a + r.burned, 0) / n,
    unfair: unfair.length,
    unfairSeeds: unfair.slice(0, 5).map((r) => `${r.seed}:${r.cause}:${r.warnLead === null ? 'none' : r.warnLead.toFixed(2)}`),
    apm: rs.reduce((a, r) => a + r.actions / (r.t / 60), 0) / n,
    usage,
  };
}

const pct = (x) => (x * 100).toFixed(1) + '%';

async function main() {
  const t0 = Date.now();
  const report = { rev, cfgHash, runs, seed0, nights: {}, gates: [] };
  const gate = (ok, label) => report.gates.push({ ok, label });
  for (const night of nights) {
    const T = WIN_TARGETS[night] || {};
    const N = (report.nights[night] = { bots: {}, ablations: [] });
    let list = [...bots];
    if (args.exploits) list.push(...EXPLOITS);
    if (args.tricks) {
      if (!list.includes('B4')) list.push('B4');
      list.push(...TRICKS);
    }
    for (const b of list) {
      const s = summarize(await play(night, b, runs));
      N.bots[b] = s;
      process.stderr.write(`N${night} ${b.padEnd(12)} win ${pct(s.win)} [${pct(s.ci[0])}, ${pct(s.ci[1])}] causes ${JSON.stringify(s.causes)}\n`);
      if (b.startsWith('T-') && N.bots.B4) {
        const base = N.bots.B4;
        gate(s.win <= base.win + TRICK_MARGIN, `N${night} 技巧 ${b} 胜率 ${pct(s.win)} ≤ 专家 ${pct(base.win)} + ${pct(TRICK_MARGIN)}`);
      }
      const tgt = b.startsWith('X-') ? T.X : T[b];
      if (tgt && !(b === 'B1')) gate(s.ci[0] >= tgt[0] - 1e-9 && s.ci[1] <= tgt[1] + 1e-9, `N${night} ${b} 胜率 ${pct(s.win)} (CI ${pct(s.ci[0])}–${pct(s.ci[1])}) ∈ [${pct(tgt[0])}, ${pct(tgt[1])}]`);
      if (['B2', 'B3', 'B4', 'B5'].includes(b)) gate(s.unfair === 0, `N${night} ${b} 不公平死亡 = ${s.unfair} ${s.unfairSeeds.join(' ')}`);
      if (b === 'B3') {
        const deaths = Object.values(s.causes).reduce((a, x) => a + x, 0);
        const maxCause = Math.max(0, ...Object.values(s.causes));
        const capCause = night === 3 ? 0.6 : night === 2 ? 0.7 : 0.55;
        if (deaths >= 30 && night >= 2) gate(maxCause / deaths <= capCause, `N${night} B3 单一死因占比 ${pct(maxCause / Math.max(1, deaths))} ≤ ${pct(capCause)}`);
        gate(s.earlyDeathShare < 0.1, `N${night} B3 00–01 点死亡占比 ${pct(s.earlyDeathShare)} < 10%`);
        gate(s.overtime <= 0.2, `N${night} B3 加班比例 ${pct(s.overtime)} ≤ 20%`);
        gate(s.burnedAvg <= 1, `N${night} B3 平均烧坏灯管 ${s.burnedAvg.toFixed(2)} ≤ 1`);
        const pw = s.medianPowerWin;
        const range = night === 1 ? [30, 50] : night <= 3 ? [15, 30] : [5, 20];
        if (pw !== null) gate(pw >= range[0] && pw <= range[1], `N${night} B3 获胜剩余电量中位数 ${pw.toFixed(1)}% ∈ [${range[0]}, ${range[1]}]`);
      }
    }
    if (args.ablate) {
      for (const [b, off, kind] of ABLATIONS[night] || []) {
        const base = N.bots[b] || summarize(await play(night, b, runs));
        const ab = summarize(await play(night, `${b}!${off}`, runs));
        const drop = base.win - ab.win;
        N.ablations.push({ bot: b, off, kind, base: base.win, ablated: ab.win, drop });
        process.stderr.write(`N${night} ablate ${b}!${off}: ${pct(base.win)} -> ${pct(ab.win)}\n`);
        if (kind === 'counter') gate(drop >= 0.3 || ab.win <= base.win * 0.2, `N${night} 消融 ${off}（对策型, ${b}）${pct(base.win)} → ${pct(ab.win)}`);
        else {
          const need = Math.min(0.03, base.win * 0.15);
          gate(drop >= need, `N${night} 消融 ${off}（取舍型, ${b}）下降 ${pct(drop)} ≥ ${pct(need)}`);
        }
      }
    }
    // monotonic B3
  }
  const b3 = nights.map((n) => report.nights[n].bots.B3?.win).filter((x) => x !== undefined);
  for (let i = 1; i < b3.length; i++) {
    const d = b3[i - 1] - b3[i];
    // near the floor an absolute 5pp drop is impossible: require 30% relative
    const [lo, hi] = [Math.min(0.05, b3[i - 1] * 0.3), 0.35];
    gate(d >= lo && d <= hi, `B3 N${nights[i - 1]}→N${nights[i]} 下降 ${pct(d)} ∈ [${pct(lo)}, ${pct(hi)}]`);
  }
  report.seconds = (Date.now() - t0) / 1000;
  writeReport(report);
}

function writeReport(r) {
  if (!existsSync('reports')) mkdirSync('reports');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const base = `reports/balance-${stamp}`;
  writeFileSync(base + '.json', JSON.stringify(r, null, 1));
  let md = `# 平衡报告 ${stamp}\n\n- git: \`${r.rev}\` · 配置哈希: \`${r.cfgHash}\` · 每组 ${r.runs} 局 · 起始种子 ${r.seed0} · 用时 ${r.seconds.toFixed(0)}s\n\n`;
  const failed = r.gates.filter((g) => !g.ok);
  md += `## 门槛：${failed.length ? `❌ ${failed.length} 项未通过` : '✅ 全部通过'}\n\n`;
  for (const g of r.gates) md += `- ${g.ok ? '✅' : '❌'} ${g.label}\n`;
  for (const [n, N] of Object.entries(r.nights)) {
    md += `\n## 第 ${n} 夜\n\n| 机器人 | 胜率 | 95% CI | 加班 | 解雇 | 获胜电量中位 | 烧灯 | APM | 不公平 | 死因 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const [b, s] of Object.entries(N.bots)) {
      md += `| ${b} | ${pct(s.win)} | ${pct(s.ci[0])}–${pct(s.ci[1])} | ${pct(s.overtime)} | ${pct(s.fired)} | ${s.medianPowerWin === null ? '—' : s.medianPowerWin.toFixed(1) + '%'} | ${s.burnedAvg.toFixed(2)} | ${s.apm.toFixed(1)} | ${s.unfair} | ${Object.entries(s.causes).map(([k, v]) => `${k} ${v}`).join(', ')} |\n`;
    }
    const b3 = N.bots.B3;
    if (b3) md += `\nB3 死亡时间分布（每小时）：${b3.deathHourBins.join(' / ')}\n\nB3 平均每局操作：${Object.entries(b3.usage).map(([k, v]) => `${k} ${v}`).join(', ')}\n`;
    if (N.ablations.length) {
      md += `\n| 消融 | 类型 | 原胜率 | 禁用后 | 下降 |\n|---|---|---|---|---|\n`;
      for (const a of N.ablations) md += `| ${a.bot} 禁用 ${a.off} | ${a.kind} | ${pct(a.base)} | ${pct(a.ablated)} | ${pct(a.drop)} |\n`;
    }
  }
  writeFileSync(base + '.md', md);
  console.log(md);
  console.log(`\n报告: ${base}.md`);
  process.exitCode = failed.length ? 1 : 0;
}

main();
