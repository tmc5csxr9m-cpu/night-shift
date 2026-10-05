# 平衡工具

```bash
node balance/run.js --nights 1-2 --bots B0,B1,B2,B3,B4,B5 --runs 2000 --ablate --exploits   # 完整报告 -> reports/
node balance/sweep.js --night 2 --bots B2,B3,B4 --runs 500 '{"actors":{"pip":{"attackDelay":5}}}'  # 参数扫描
```

- `agent.js`：人类约束（单注意力、时间成本、反应延迟、只能看到 Observation）。
- `bots/`：B0 挂机、B1 随机、B2/B3/B4 规则式（新手/平均/专家）、B5 预言、X-* 漏洞探测，`B3!lure` 形式为消融。
- `gates.js`：硬性门槛（GAME_PLAN 11.5）。
- `balance.config.json`：实验用的参数覆盖（定稿后写回 `src/sim`，这里保持 `{}`）。
