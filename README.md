# NIGHT SHIFT — FNAF 同人

Three.js 3D 保安室 + 老式蓝白字符终端（TUI）的生存恐怖游戏。设计与开发计划见 [GAME_PLAN.md](GAME_PLAN.md)。

## 运行与构建

本作只通过桌面程序运行（Electron），不再支持浏览器。

```bash
npm install
NODE_USE_ENV_PROXY=1 node node_modules/electron/install.js   # 首次: 下载 Electron (走代理时需要 NODE_USE_ENV_PROXY)
npm run dev          # 开发: Vite 热更新 + 桌面窗口
npm run build:win    # 发布版: release/NightShift-<版本>-win-x64.exe (单文件便携版, 需要 wine 写入图标与版本信息)
npm run build:linux  # 测试版: release/NightShift-<版本>-linux-x86_64.AppImage
```

| | Windows `.exe`（发布） | Linux AppImage（个人测试） |
|---|---|---|
| 调试模式 | 隐藏 | 主菜单可开 |
| DevTools (F12) | 禁用 | 可用 |

- **存档**：`%APPDATA%\NightShift\save.json`（Windows）/ `~/.config/NightShift/save.json`（Linux）。先写临时文件再替换，上一份存档保留为 `save.json.bak`；主存档损坏时自动从备份恢复。只允许同时运行一个实例。
- **窗口**：默认全屏；设置 → 显示模式可切换 1280×720 / 1600×900 / 1920×1080 窗口，立即生效并在下次启动沿用。
- **鼠标**：游戏始终绘制自己的光标。全屏模式不捕获鼠标（屏幕边缘自然挡住），ESC 一按即生效；窗口模式捕获鼠标（指针锁定），按 ESC 后由下一次点击重新捕获。光标从侧边滑到另一块显示器时视角继续向那边转。
- **退出**：主菜单长按 ESC，或「退出游戏」。夜里长按 ESC 返回主菜单。
- **自动化测试**：`xvfb-run -a node tools/smoke.mjs <脚本.mjs> [-- <程序>]` 在虚拟显示器上驱动开发版或打包版（真实鼠标/键盘事件 + 截图）。
- 未签名的 exe 在 Windows 上首次运行会触发 SmartScreen 提示（「更多信息 → 仍要运行」）。

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
| v3 策略审查与全面加难（GAME_PLAN 11.5c） | ✅ |
| v4 听觉优先、逼迫离开终端、电力经济重做（GAME_PLAN 11.5d） | ✅ N1–N6 全部门槛 + 套路探针（含 X-terminalOnly）+ 机制消融 |
| 桌面版（Electron）：光敏警告、值班手册、版权页、存档文件、窗口模式、长按 ESC 退出 | ✅ |
| M7 打磨（Boss 演出细节、真人试玩校准） | 进行中 |

## 操作

- 鼠标移到屏幕左右边缘：转头；点击终端：聚焦（字符光标）；右键 / ESC：离开终端
- 长按 ESC：夜里返回主菜单（本夜不计入记录），主菜单里退出游戏
- 不在终端上的东西：门边墙上的灯开关（看着门时点）、桌上的电话、前方架子上的音乐盒（按住上发条）
- 桑尼熊和皮普兔要「开灯 + 转头盯着」才有效
- 终端上的 `?`：值班手册（夜里也能查，时间照常流逝）
- 菜单栏右侧快捷栏：左右门灯、磁锁（N3 起）、♪ 重放上一次诱饵、消磁（任何页面都能用）
- 点击桌上的电话：接听 / 挂断留言

## 调试模式

仅 Linux 测试版 / 开发版：主菜单 → `调试模式 [开]`（无前置条件）。开启后可以选择任意夜晚和「空夜」，夜里按 **F1** 或 **`** 打开信息面板：
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
electron/         桌面外壳：app:// 协议、存档文件、窗口模式、长按 ESC 退出
tools/            dev.mjs 开发启动 · smoke.mjs 自动化测试 · gen_icon.py 图标 · gen_licenses.mjs 许可声明
src/debug/        调试面板
src/save.js       存档
balance/          玩家模型、机器人、批量对局、门槛、报告
tools/gen_audio.py  全部音频的合成脚本（npm run audio）
```

## 版权

© 2026 @g_t_u (bilibili)，保留所有权利。本作由 AI（Anthropic Claude）制作。FNAF 同人作品，与 Scott Cawthon 及 FNAF 官方无关。第三方组件许可见 `LICENSE` 与打包产物中的 `LICENSES.txt`。
