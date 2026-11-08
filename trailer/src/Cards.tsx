// The download end card of the trailer.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, REPO, chroma } from './theme';

const scan: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)',
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
