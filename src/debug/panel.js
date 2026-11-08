// Debug overlay: live sim internals + controls. Only reads the World and
// acts through world.cmd / world.dbg so it uses the same rules as play.
import { game } from '../game.js';
import { NODES } from '../sim/graph.js';
import { ACTOR_NAMES, NIGHTS } from '../sim/index.js';

// everything shown in the panel is rendered as text: replays are files from anywhere
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// a replay is { night, seed, commands: [{ tick, name, args }] } with known commands only
const REPLAY_CMDS = /^(look|focus|page|doorLight|officeLight|fan|oscillate|vent|breaker|resetMain|scan|lure|lureRepeat|roomLight|seal|maglock|wind|degauss|answerPhone|hangUp|taskComplete|rebootNode|replaceBulb|lockBreaker|generator|backfire)$/;
function validReplay(d) {
  if (!d || typeof d !== 'object' || !NIGHTS[d.night] || !Number.isInteger(d.seed) || !Array.isArray(d.commands)) return null;
  const commands = [];
  for (const c of d.commands) {
    if (!c || !Number.isInteger(c.tick) || c.tick < 0 || typeof c.name !== 'string' || !REPLAY_CMDS.test(c.name)) return null;
    const args = c.args && typeof c.args === 'object' && !Array.isArray(c.args) ? c.args : {};
    for (const v of Object.values(args)) {
      if (typeof v === 'string' ? !/^[A-Za-z0-9_-]{1,16}$/.test(v) : !(typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) return null;
    }
    commands.push({ tick: c.tick, name: c.name, args: { ...args } });
  }
  return { night: d.night, seed: d.seed, commands };
}

const CSS = `
#dbg{position:fixed;top:8px;right:8px;width:430px;max-height:calc(100vh - 16px);overflow:auto;z-index:20;
 background:rgba(4,8,30,.88);border:1px solid #3d52b0;color:#c3d1ff;font:16px Unifont,monospace;padding:6px 8px;display:none}
#dbg.on{display:block}
#dbg h3{margin:6px 0 2px;font:16px Unifont,monospace;color:#7fe3ff;border-bottom:1px solid #2a3a8a}
#dbg table{border-collapse:collapse;width:100%}
#dbg td{padding:0 4px 0 0;white-space:nowrap;vertical-align:top}
#dbg .k{color:#6b7fd6}
#dbg .w{color:#ffe56b}.r{color:#ff6060}.g{color:#8affd0}.d{color:#4a60c4}
#dbg button,#dbg select{font:16px Unifont,monospace;background:#0d1b8c;color:#c3d1ff;border:1px solid #3d52b0;margin:1px;padding:0 4px;cursor:pointer}
#dbg button.on{background:#7fe3ff;color:#0a1470}
#dbg button:hover{background:#2440c8}
#dbg .row{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
#dbg .tl{max-height:150px;overflow:auto;font-size:16px}
#dbgGhost{position:fixed;left:8px;bottom:8px;z-index:20;color:#ff70ff;font:16px Unifont,monospace;background:rgba(4,8,30,.7);padding:2px 6px;display:none}
`;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  for (const k of kids) e.append(k);
  return e;
}

const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

export const debugPanel = {
  open: false,
  ghosts: true,
  acc: 0,

  init() {
    document.head.append(el('style', { textContent: CSS }));
    this.root = el('div', { id: 'dbg' });
    this.badge = el('div', { id: 'dbgGhost', textContent: 'DEBUG · F1 打开面板' });
    document.body.append(this.root, this.badge);
    this.controls = el('div');
    this.info = el('div');
    this.root.append(this.controls, this.info);
    this.buildControls();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || e.key === '`') {
        e.preventDefault();
        if (game.debug && game.world) this.toggle();
      }
    });
    // stop clicks reaching the 3D canvas
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
  },

  toggle(on = !this.open) {
    this.open = on;
    this.root.classList.toggle('on', on);
  },

  setVisible(active) {
    this.badge.style.display = active && !this.open ? 'block' : 'none';
    if (!active) this.toggle(false);
  },

  buildControls() {
    const c = this.controls;
    const b = (label, fn, id) => {
      const x = el('button', { textContent: label, onclick: () => (fn(x), this.render(true)) });
      if (id) x.dataset.id = id;
      return x;
    };
    const w = () => game.world;
    c.append(el('h3', { textContent: '控制' }));
    c.append(el('div', { className: 'row' },
      b('暂停', () => (game.paused = !game.paused), 'pause'),
      b('单步', () => {
        game.paused = true;
        game.stepOnce = true;
      }),
      ...[0.25, 0.5, 1, 2, 4, 16].map((s) => b(`×${s}`, () => (game.timeScale = s), 'ts' + s)),
    ));
    c.append(el('div', { className: 'row' }, el('span', { className: 'k', textContent: '跳到 ' }),
      ...[0, 1, 2, 3, 4, 5].map((h) => b(`${h}点`, () => w().dbg('setTime', { t: h * w().P.hourSeconds + 0.05 }))),
      b('5:59', () => w().dbg('setTime', { t: w().P.nightSeconds - 1.5 })),
    ));
    c.append(el('div', { className: 'row' },
      b('无敌', () => (w().debug.god = !w().debug.god), 'god'),
      b('无限电', () => (w().debug.infinitePower = !w().debug.infinitePower), 'inf'),
      b('冻结', () => (w().debug.freeze = !w().debug.freeze), 'freeze'),
      b('无事件', () => (w().debug.noEvents = !w().debug.noEvents), 'noev'),
      b('幽灵', () => (this.ghosts = !this.ghosts), 'ghost'),
    ));
    c.append(el('div', { className: 'row' },
      b('补满', () => w().dbg('refill')),
      b('完成任务', () => w().tasks.forEach((t) => w().dbg('completeTask', { id: t.id }))),
      b('卡继电器', () => w().dbg('event', { kind: 'relayStuck' })),
      b('读数漂移', () => w().dbg('event', { kind: 'drift' })),
      b('老化跳闸', () => w().dbg('event', { kind: 'aging' })),
      b('烧左灯', () => (w().doors.L.heat = 99.9, w().doors.L.on = true)),
    ));
    // teleport
    const actorSel = el('select');
    const nodeSel = el('select');
    for (const n of NODES) nodeSel.append(el('option', { value: n, textContent: n }));
    this.actorSel = actorSel;
    c.append(el('div', { className: 'row' }, el('span', { className: 'k', textContent: '传送 ' }), actorSel, nodeSel,
      b('去', () => w().dbg('teleport', { id: actorSel.value, node: nodeSel.value })),
      b('禁用/启用', () => (w().debug.disabled[actorSel.value] = !w().debug.disabled[actorSel.value])),
    ));
    c.append(el('div', { className: 'row' },
      b('导出回放', () => this.exportReplay()),
      b('导入回放', () => this.importReplay()),
    ));
  },

  syncActors() {
    const w = game.world;
    const ids = w.actors.map((a) => a.id).join();
    if (this._ids === ids) return;
    this._ids = ids;
    this.actorSel.innerHTML = '';
    for (const a of w.actors) this.actorSel.append(el('option', { value: a.id, textContent: ACTOR_NAMES[a.id] || a.id }));
  },

  exportReplay() {
    const w = game.world;
    const data = { night: game.night, seed: w.seed, commands: w.commands, endTick: w.tickN };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: `replay-n${game.night}-${w.seed}.json` });
    a.click();
  },

  importReplay() {
    const inp = el('input', { type: 'file', accept: '.json' });
    inp.onchange = async () => {
      let data;
      try {
        data = validReplay(JSON.parse(await inp.files[0].text()));
      } catch {
        data = null;
      }
      if (data) this.onReplay?.(data);
      else alert('不是有效的回放文件');
    };
    inp.click();
  },

  update(dt) {
    const active = game.debug && !!game.world;
    this.setVisible(active);
    if (!active || !this.open) return;
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    this.render();
  },

  render() {
    const w = game.world;
    if (!w) return;
    this.syncActors();
    for (const x of this.controls.querySelectorAll('button[data-id]')) {
      const id = x.dataset.id;
      const on = {
        pause: game.paused, god: w.debug.god, inf: w.debug.infinitePower, freeze: w.debug.freeze,
        noev: w.debug.noEvents, ghost: this.ghosts,
      }[id] ?? (id.startsWith('ts') ? game.timeScale === Number(id.slice(2)) : false);
      x.classList.toggle('on', !!on);
    }
    const pw = w.power;
    const parts = Object.entries(pw.parts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
    const rate = pw.load / 60;
    const eta = rate > 0 ? pw.reserve / rate : Infinity;
    const noise = Object.entries(w.noise.parts).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ');
    const tr = (...cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    let html = '';
    html += '<h3>模拟</h3><table>';
    html += tr('<span class=k>夜</span>', `${game.nightName(game.night)} · 种子 ${w.seed}`, '<span class=k>tick</span>', w.tickN);
    html += tr('<span class=k>时间</span>', `${w.clock()} ${w.clockStuck ? '<span class=r>停</span>' : ''} · 实 ${w.t.toFixed(1)}s`, '<span class=k>小时</span>', w.hour);
    html += tr('<span class=k>倍率</span>', `${game.timeScale}× ${game.paused ? '<span class=w>暂停</span>' : ''}`, '<span class=k>结果</span>', w.result ? `<span class=w>${w.result.outcome}</span>` : '—');
    html += '</table><h3>电力</h3><table>';
    html += tr('<span class=k>储备</span>', `${pw.reserve.toFixed(2)} / ${pw.max} kW·min (${w.powerPct().toFixed(1)}%)`);
    html += tr('<span class=k>负载</span>', `${pw.load.toFixed(2)} kW ${pw.tripped ? '<span class=r>跳闸</span>' : ''}${pw.out ? '<span class=r> 断电</span>' : ''} · 耗尽 ${eta === Infinity ? '∞' : (eta * 1).toFixed(0) + 's'}`);
    html += tr('<span class=k>分项</span>', `<span class=d>${parts}</span>`);
    html += tr('<span class=k>回路</span>', Object.entries(w.circuits).map(([k, v]) => (v ? k : `<span class=r>${k}</span>`)).join(' '));
    html += '</table><h3>环境</h3><table>';
    html += tr('<span class=k>温度</span>', `室 ${w.temp.room.toFixed(2)} 效 ${w.temp.eff.toFixed(2)} 外 ${w.temp.out} ${w.temp.rebootT > 0 ? '<span class=r>重启</span>' : ''}`);
    html += tr('<span class=k>噪音</span>', `${w.noise.db.toFixed(1)} dB · 兔子 +${w.noiseBonus()} · <span class=d>${noise}</span>`);
    html += tr('<span class=k>磁化</span>', `${w.emi.magnet.toFixed(2)}${w.emi.cooldown > 0 ? ' · 消磁冷却' : ''}`);
    html += tr('<span class=k>门灯</span>', ['L', 'R'].map((s) => {
      const d = w.doors[s];
      return `${s}:${w.doorLit(s) ? '<span class=w>亮</span>' : '灭'} 热${d.heat.toFixed(0)}${d.broken ? '<span class=r>坏</span>' : ''}${d.stuckT > 0 ? '<span class=r>卡</span>' : ''}`;
    }).join(' · ') + ` · 备件 ${w.spares}`);
    html += tr('<span class=k>办公室</span>', `灯${w.office.light} 扇${w.office.fan ? '开' : '关'} 风${w.office.vent} 锁${w.office.maglock ? '■' : '□'} 线圈${w.office.coil.toFixed(1)}`);
    html += tr('<span class=k>音乐盒</span>', `${(w.musicBox.wind * 100).toFixed(1)}% ${w.musicBox.auto ? '自动' : w.musicBox.hand ? '手摇(架子)' : '遥控'} ${w.musicPlaying() ? '<span class=g>播放</span>' : '<span class=r>停止</span>'}`);
    html += tr('<span class=k>电话</span>', `${w.phone.state} ${w.phone.t.toFixed(1)}s · 新威胁缓冲 ${Math.max(0, w.callGate - w.t).toFixed(0)}s`);
    html += tr('<span class=k>校准</span>', Object.entries(w.calibrated).map(([k, v]) => (v ? `<span class=g>${k}</span>` : `<span class=d>${k}</span>`)).join(' '));
    html += '</table><h3>表演者</h3><table>';
    for (const a of w.actors) {
      const eff = a.aEff();
      const mods = Object.entries(a.mods).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(' ');
      const info = Object.entries(a.info()).map(([k, v]) => `${k}:${f1(v)}`).join(' ');
      const dis = w.debug.disabled[a.id] ? ' <span class=r>禁用</span>' : '';
      html += tr(`<span class=w>${ACTOR_NAMES[a.id] || a.id}</span>${dis}`, `${a.node} · ${a.state}${a.state === 'door' ? ` <span class=r>攻 ${a.attackT.toFixed(1)}s</span>` : ''}`);
      html += tr('', `A ${a.baseA()} → ${eff} <span class=d>${mods}</span> · 掷 ${a.lastRoll ?? '-'}/${f1(a.lastA ?? '-')} · 计时 ${f1(a.timer || 0)}`);
      if (info) html += tr('', `<span class=d>${info}</span>`);
    }
    html += '</table><h3>任务 / 紧急</h3>';
    html += w.tasks.map((t) => (t.done ? `<span class=g>${t.id}√</span>` : `<span class=w>${t.id}</span>`)).join(' ') || '—';
    html += ' · ' + (w.emergencies.map((e) => `<span class=r>${e.id}${e.side || ''}</span>`).join(' ') || '无紧急');
    html += '<h3>声音线索 (听到概率)</h3><div class=tl>';
    html += w.cues.slice(-12).reverse().map((c) => `${c.t.toFixed(1)} ${esc(c.source)} ${esc(c.node)}(${esc(c.side)}) ${c.db.toFixed(0)}dB p=<span class=${c.p > 0.5 ? 'g' : 'r'}>${c.p.toFixed(2)}</span> ${c.kind}`).join('<br>');
    html += '</div><h3>时间线</h3><div class=tl>';
    html += w.timeline.slice(-30).reverse().filter((e) => e.type !== 'cmd' || e.name !== 'page').map((e) => {
      const d = { ...e };
      delete d.type;
      delete d.t;
      return `${e.t.toFixed(1)} <span class=w>${esc(e.type)}</span> <span class=d>${esc(JSON.stringify(d).slice(0, 70))}</span>`;
    }).join('<br>');
    html += '</div>';
    this.info.innerHTML = html;
  },
};
