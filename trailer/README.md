# NIGHT SHIFT 宣传片（Remotion）

约 50 秒、1920×1080、30fps 的恐怖预告：冷开场 → 开灯的一瞬间它就在门口 → 120 BPM 的短镜头与短句 → 越来越快的蒙太奇 → 静音 → 最后一下惊吓 → 片名 → 彩蛋 → AI 声明与下载。画面全部是游戏实机录制；字卡视觉先在 Claude Design 画布中设计；配乐由 `tools/score.py` 用 numpy 从零合成，并按 `src/timeline.json` 与剪辑逐拍对齐（同一份时间轴驱动画面和音乐），音效取自游戏本身。

## 1. 录制实机画面

开发版的测试钩子可以冻结主循环、以固定 1/30 秒逐帧推进游戏并截图，所以即使在没有 GPU 的虚拟显示器上也能录出流畅的画面：

```bash
cd ..                        # 游戏仓库根目录
SMOKE_OUT=trailer/frames xvfb-run -a -s "-screen 0 1920x1080x24" node tools/smoke.mjs trailer/tools/capture.mjs
# 只录某几段: CLIPS=sunny,pip ...
cd trailer && ./tools/encode.sh frames     # -> public/footage/*.mp4
```

`tools/capture.mjs` 里每一段都是一小段脚本：选夜、跳到某个时间点、把表演者传送到门口、转头、开灯……然后逐帧推进。

## 2. 剪辑与渲染

```bash
npm install
npm run studio               # 预览 / 调整时间线
python3 tools/score.py       # 配乐 -> public/score.wav (需要 numpy)
npm run render               # -> out/night-shift-trailer.mp4
ffmpeg -i out/night-shift-trailer.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/night-shift-trailer-final.mp4
```

无法下载 Remotion 自带的 Chrome 时，可以用 `REMOTION_CHROME=/path/to/chrome-headless-shell` 指定本地浏览器。

`npm run assets` 会把游戏的字体和音效复制进 `public/`（studio / render 前自动执行）。

`src/timeline.json` 是剪辑表（每个镜头 / 字卡的起止帧、素材与效果），`src/Trailer.tsx` 按它渲染，`src/Cards.tsx` 里是下载片尾。
