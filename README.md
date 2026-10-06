# NIGHT SHIFT — FNAF 同人

Three.js 3D 保安室 + 老式蓝白字符终端（TUI）的生存恐怖游戏。设计与开发计划见 [GAME_PLAN.md](GAME_PLAN.md)。

## 运行

```bash
npm install
npm run dev        # http://localhost:5199   (加 ?debug 直接打开调试模式)
```

建议戴耳机、关灯游玩。

## 当前进度

| 里程碑 | 状态 |
|---|---|
| M0 确定性模拟核心 `src/sim` | ✅ |
| M1 CRT 主菜单 / 存档 / 调试模式 | ✅ |
| M2 平衡模型与机器人 | ✅ |
| M3 Night 1–2（桑尼熊、皮普兔、嘟嘟鸟、大厨，完整表现） | ✅ |
| M4 Night 3–4（后门之物、磁锁、手动发条、冷库压缩机） | ✅ |
| M5 Night 5（丝带 / 通风、雷暴停电、发电机） | ✅ |
| M6 Night 6 Boss STARLIGHT（夺取配电、伪造感知、夺取终端、捉迷藏） | ✅ |
| v3 策略审查与全面加难（GAME_PLAN 11.5c） | ✅ N1–N6 全部门槛 + 套路探针 + 机制消融 |
| M7 打磨（音乐盒实物、断电演出、Boss 演出细节） | 进行中 |

## 操作

- 鼠标移到屏幕左右边缘：转头；点击终端：聚焦（字符光标）；右键 / ESC：离开终端
- 菜单栏右侧快捷栏：左右门灯、磁锁（N3 起）、♪ 重放上一次诱饵、消磁（任何页面都能用）
- 点击桌上的电话：接听 / 挂断留言

## 调试模式

主菜单 → `调试模式 [开]`（无前置条件）。开启后可以选择任意夜晚和「空夜」，夜里按 **F1** 或 **`** 打开信息面板：
模拟时间与倍率、电力分项、温度噪音、EMI、每个表演者的节点 / 进攻值 / 修正项 / 计时器、声音线索的听到概率、事件时间线；
可以暂停、单步、加速、跳时间、无敌、无限电、冻结、传送表演者、触发事件、导出 / 导入回放。调试对局不写入存档。

## 平衡

```bash
npm run balance -- --nights 1-6 --bots B0,B2,B3,B4,B5 --runs 1000 --ablate --exploits --tricks
node balance/run.js --nights 6 --bots B4,B4!seal,B4!generator --runs 1000     # 单个机制消融
node balance/sweep.js --night 2 --bots B2,B3,B4 --runs 500 '{"actors":{"pip":{"attackDelay":5}}}'
```

报告写入 `reports/`。详见 [balance/README.md](balance/README.md) 与 GAME_PLAN 第 11 章。

## 结构

```
src/sim/          游戏规则（纯逻辑、确定性；浏览器与 Node 共用）
src/game.js       推进模拟、转发事件
src/term/         终端：屏幕、控件、页面（主菜单 / 结算 / 四大板块）、小游戏
src/scene/        房间、表演者模型、CRT 着色器、后期
src/audio.js      3D 环境音、蜂鸣器、电话（铃声 + 合成人声）
src/debug/        调试面板
src/save.js       存档
balance/          玩家模型、机器人、批量对局、门槛、报告
tools/gen_audio.py  全部音频的合成脚本（npm run audio）
```
