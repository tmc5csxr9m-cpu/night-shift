# NIGHT SHIFT — FNAF 同人氛围 Demo

一个可以互动的保安室：Three.js 3D 场景 + 老式蓝白字符终端 TUI。玩法设计见 [DESIGN.md](DESIGN.md)。

## 运行

```bash
npm install
npm run dev        # http://localhost:5199
```

建议戴耳机、关灯游玩。重新生成音频：`npm run audio`（需要 python3 + numpy + ffmpeg）。

## 结构

```
src/
  main.js            渲染器、视角控制、终端聚焦、世界状态联动、主循环
  state.js           共享游戏状态 + 事件
  rooms.js           房间布局（终端地图和 3D 声音定位共用）
  director.js        环境事件：远处的声音、闪烁、终端干扰
  audio.js           3D 环境音 + 实时合成的蜂鸣器
  scene/room.js      保安室与走廊几何
  scene/textures.js  程序化贴图（地砖、墙、海报、涂鸦……）
  scene/crt.js       CRT 着色器
  scene/post.js      后期（泛光、颗粒、暗角）
  term/screen.js     80×30 字符屏（Unifont，中文双宽）
  term/ui.js         即时模式 TUI 控件
  term/terminal.js   开机、状态栏、菜单、逐行输出、字符光标
  term/pages/        主页 / 电力 / 地图 / 设施 / 任务
  term/games/        四个任务小游戏
tools/gen_audio.py   所有音频的合成脚本
public/fonts/        GNU Unifont (OFL / GPL+FE)
```

开发模式下控制台可用 `__game` 调试（例如 `__game.director.fire('creak')`）。
