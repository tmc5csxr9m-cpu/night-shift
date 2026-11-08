// Full-screen cards of the trailer (title, beat words, AI credits, download).
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, REPO, chroma } from './theme';

const scan: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)',
};

// one punchy word or line, slammed in
export const BeatCard: React.FC<{ text: string; tone?: 'white' | 'blue' | 'red' }> = ({ text, tone = 'white' }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, 5], [1.18, 1], { extrapolateRight: 'clamp' });
  const out = interpolate(frame, [durationInFrames - 4, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bg = tone === 'blue' ? C.blue : tone === 'red' ? '#1a0406' : '#050505';
  const color = tone === 'red' ? C.red : tone === 'blue' ? '#ffffff' : C.white;
  const jitter = tone === 'red' && random(`j${frame}`) < 0.25 ? (random(`x${frame}`) - 0.5) * 16 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: bg, alignItems: 'center', justifyContent: 'center', fontFamily: FONT, ...scan }}>
      <div style={{ fontSize: 150, letterSpacing: 22, color, opacity: out, transform: `scale(${scale}) translateX(${jitter}px)`, textShadow: tone === 'red' ? chroma(5) : undefined }}>{text}</div>
    </AbsoluteFill>
  );
};

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = interpolate(frame, [0, 8, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // the logo flickers on like a tube warming up
  const flick = frame < 14 ? (random(`f${frame}`) < 0.45 ? 0.25 : 1) : 1;
  const split = frame < 20 ? 14 - frame * 0.4 : 6;
  return (
    <AbsoluteFill style={{ backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 36, fontFamily: FONT, color: C.fg, opacity: fade, ...scan }}>
      <div style={{ fontSize: 30, letterSpacing: 12, color: C.dim }}>STARLIGHT SEC-OS 2.31</div>
      <div style={{ fontSize: 184, letterSpacing: 22, color: C.white, opacity: flick, textShadow: chroma(split) }}>NIGHT SHIFT</div>
      <div style={{ fontSize: 48, letterSpacing: 16 }}>星光披萨乐园 · 夜班保安</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40, opacity: interpolate(frame, [18, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <div style={{ width: 120, height: 2, backgroundColor: C.red }} />
        <div style={{ fontSize: 34, letterSpacing: 10, color: C.red }}>六个夜晚 · 一台终端 · 什么都看不见</div>
        <div style={{ width: 120, height: 2, backgroundColor: C.red }} />
      </div>
    </AbsoluteFill>
  );
};

const CREDITS: [string, string][] = [
  ['程序 .............', 'Claude'],
  ['关卡与平衡 .......', 'Claude'],
  ['3D 场景与模型 ....', 'Claude'],
  ['音效与音乐 .......', 'Claude'],
  ['文字与界面 .......', 'Claude'],
  ['本宣传片 .........', 'Claude'],
];

export const AiCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = interpolate(frame, [0, 6, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shown = Math.floor(frame / 4);   // one line every 4 frames, like the terminal prints
  const big = interpolate(frame, [34, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', fontFamily: FONT, opacity: fade }}>
      <div style={{ width: 1560, height: 840, backgroundColor: C.blue, borderRadius: 28, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ backgroundColor: C.fg, color: C.ink, fontSize: 30, padding: '6px 24px', display: 'flex', justifyContent: 'space-between' }}>
          <span>★ STARLIGHT SEC-OS 2.31</span>
          <span>CREDITS.EXE</span>
        </div>
        <div style={{ padding: '48px 72px', display: 'flex', flexDirection: 'column', gap: 18, color: C.fg, fontSize: 38 }}>
          <div style={{ color: '#ffffff' }}>C:\SEC&gt; CREDITS.EXE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 64, rowGap: 12, marginTop: 12 }}>
            {CREDITS.map(([k, v], i) => (
              <div key={k} style={{ opacity: shown > i ? 1 : 0 }}>
                {k} <span style={{ color: C.cyan }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 2, backgroundColor: C.dim2, margin: '28px 0 20px' }} />
          <div style={{ fontSize: 76, color: C.yellow, letterSpacing: 6, opacity: big, transform: `translateY(${(1 - big) * 20}px)` }}>这是一个完全由 AI 生成的 Demo</div>
          <div style={{ fontSize: 32, color: C.fg, opacity: big }}>代码、玩法、数值、画面、声音与文字均由 Anthropic 的 Claude 生成</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const box = interpolate(frame, [14, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursor = Math.floor(frame / 15) % 2 === 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 30, fontFamily: FONT, color: C.fg, opacity: fade, ...scan }}>
      <div style={{ fontSize: 120, color: C.white, letterSpacing: 18, textShadow: chroma(5) }}>NIGHT SHIFT</div>
      <div style={{ fontSize: 40, letterSpacing: 10 }}>免费下载 · 开源 (AGPL-3.0)</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 30, padding: '34px 64px', backgroundColor: C.blue, border: `3px solid ${C.fg}`, opacity: box, transform: `scale(${0.96 + box * 0.04})` }}>
        <div style={{ fontSize: 30, color: C.yellow, letterSpacing: 6 }}>GitHub · Releases</div>
        <div style={{ fontSize: 58, color: '#ffffff' }}>
          {REPO}
          <span style={{ opacity: cursor ? 1 : 0 }}>_</span>
        </div>
        <div style={{ fontSize: 30, color: C.fg }}>Windows .exe · Linux AppImage</div>
      </div>
      <div style={{ fontSize: 30, color: C.dim, marginTop: 24, letterSpacing: 4 }}>完全由 AI (Claude) 生成的 Demo · 建议戴耳机、关灯游玩</div>
      <div style={{ fontSize: 22, color: C.dim2 }}>FNAF 同人作品, 与 Scott Cawthon 及 FNAF 官方无关</div>
    </AbsoluteFill>
  );
};
