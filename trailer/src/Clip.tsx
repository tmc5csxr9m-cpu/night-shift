// A piece of real gameplay (recorded from the game, see tools in README.md)
// with an optional numbered caption in the lower left.
import React from 'react';
import { Video } from '@remotion/media';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from './theme';

export const Caption: React.FC<{ n?: string; title: string; sub?: string; accent?: string }> = ({ n, title, sub, accent = C.yellow }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inX = interpolate(frame, [2, 9], [-60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const op = interpolate(frame, [2, 9, durationInFrames - 4, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 96, bottom: 110, display: 'flex', flexDirection: 'column', gap: 12, opacity: op, transform: `translateX(${inX}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {n ? <div style={{ fontSize: 44, color: C.ink, backgroundColor: accent, padding: '4px 16px' }}>{n}</div> : null}
          <div style={{ fontSize: 80, color: '#ffffff', letterSpacing: 8, textShadow: '0 0 18px rgba(0,0,0,0.95), 0 0 4px #000' }}>{title}</div>
        </div>
        {sub ? <div style={{ fontSize: 40, color: C.fg, backgroundColor: 'rgba(0,0,10,0.62)', padding: '6px 16px', alignSelf: 'flex-start' }}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// small "recorded in-game" tag in the top left of every gameplay shot
export const RecTag: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 72, top: 56, display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, color: C.fg, backgroundColor: 'rgba(0,0,10,0.55)', padding: '8px 16px', fontFamily: FONT }}>
      <span style={{ color: C.red, opacity: Math.floor(frame / 15) % 2 ? 0.25 : 1 }}>●</span>
      <span>实机画面</span>
    </div>
  );
};

export const Shot: React.FC<{ src: string; from?: number; rate?: number; light?: number; zoom?: number; children?: React.ReactNode }> = ({ src, from = 0, rate = 1, light = 1, zoom = 1, children }) => {
  const frame = useCurrentFrame();
  // a slow push-in keeps short cuts alive
  const push = zoom * (1 + frame * 0.0012);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, filter: light !== 1 ? `brightness(${light}) contrast(1.05)` : undefined }}>
        <Video src={staticFile(`footage/${src}.mp4`)} trimBefore={from} playbackRate={rate} muted style={{ width: '100%', height: '100%' }} />
      </AbsoluteFill>
      <RecTag />
      {children}
    </AbsoluteFill>
  );
};

// a white frame between hard cuts
export const Flash: React.FC<{ color?: string }> = ({ color = '#ffffff' }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ backgroundColor: color, opacity: interpolate(frame, [0, 4], [0.9, 0], { extrapolateRight: 'clamp' }) }} />;
};
