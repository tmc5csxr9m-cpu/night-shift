// NIGHT SHIFT trailer v2: a horror teaser, not a feature tour.
// Cold open -> hook (the light snaps on, it is right there) -> a 120 BPM
// build of short shots and terse lines -> an accelerating montage -> dead
// silence -> one last scare -> title -> a stinger -> made by AI -> download.
// The edit and the score (tools/score.py -> public/score.wav) are both built
// from src/timeline.json, so every cut lands where the music hits.
import React from 'react';
import { Audio, Video } from '@remotion/media';
import { AbsoluteFill, Sequence, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import timeline from './timeline.json';
import { EndCard } from './Cards';
import { C, FONT, chroma } from './theme';

type Cut = {
  at: number; len: number; kind: string; src?: string; from?: number; rate?: number; text?: string; tone?: string;
  push?: number; light?: number; shake?: number; hit?: boolean; flash?: boolean; glitch?: boolean; blur?: boolean;
};

const BAR = 138; // 2.39:1 letterbox on 1920x1080

const Letterbox: React.FC = () => (
  <>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: BAR, backgroundColor: '#000' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR, backgroundColor: '#000' }} />
  </>
);

// film grain + vignette over everything
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', opacity: 0.11, mixBlendMode: 'screen' }}>
        <filter id={`g${frame}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 97} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="1920" height="1080" filter={`url(#g${frame})`} />
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

// where the whip pans happen in the captured clip (source frames)
const WHIP = [[18, 26], [40, 48]];

const Shot: React.FC<{ c: Cut }> = ({ c }) => {
  const f = useCurrentFrame();
  const src = (c.from ?? 0) + f * (c.rate ?? 1);
  let shake = (c.shake ?? 0) * Math.exp(-f / 10) * 26;
  if (c.hit && f < 3) shake += 30;
  const sx = shake ? (random(`x${c.at}-${f}`) - 0.5) * shake : 0;
  const sy = shake ? (random(`y${c.at}-${f}`) - 0.5) * shake : 0;
  const scale = 1.04 + f * (c.push ?? 0.002);
  let blur = 0;
  if (c.blur) for (const [a, b] of WHIP) if (src >= a && src <= b) blur = 14 * Math.sin(((src - a) / (b - a)) * Math.PI);
  const g = c.glitch && random(`gl${c.at}-${Math.floor(f / 2)}`) < 0.35;
  const filters = [c.light ? `brightness(${c.light})` : '', 'contrast(1.12) saturate(0.9)', blur ? `blur(${blur.toFixed(1)}px)` : '', g ? `hue-rotate(${Math.round(random(`h${c.at}${f}`) * 60 - 30)}deg) saturate(1.6)` : ''].join(' ');
  const flash = c.flash || c.hit ? interpolate(f, [0, 3], [c.hit ? 1 : 0.6, 0], { extrapolateRight: 'clamp' }) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${sx + (g ? (random(`gx${c.at}${f}`) - 0.5) * 40 : 0)}px, ${sy}px) scale(${scale})`, filter: filters }}>
        <Video src={staticFile(`footage/${c.src}.mp4`)} trimBefore={c.from ?? 0} playbackRate={c.rate ?? 1} muted style={{ width: '100%', height: '100%' }} />
      </AbsoluteFill>
      {g ? <AbsoluteFill style={{ background: `linear-gradient(0deg, transparent ${Math.round(random(`b${c.at}${f}`) * 80)}%, rgba(255,0,40,0.18) 0, rgba(255,0,40,0.18) ${Math.round(random(`b${c.at}${f}`) * 80) + 6}%, transparent 0)` }} /> : null}
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
};

// a terse line on black: snaps in with a flicker, drifts, cuts out on the beat
const Line: React.FC<{ c: Cut }> = ({ c }) => {
  const f = useCurrentFrame();
  const red = c.tone === 'red';
  const whisper = c.tone === 'whisper';
  const warm = c.tone === 'warm';
  const on = f === 1 || f === 3 ? 0.35 : 1;
  const scale = 1.06 - Math.min(1, f / c.len) * 0.06;
  const jitter = red && random(`t${c.at}-${f}`) < 0.3 ? (random(`tx${c.at}-${f}`) - 0.5) * 18 : 0;
  const fade = warm ? interpolate(f, [0, 10, c.len - 12, c.len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: red ? '#120203' : '#000', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{
        fontSize: whisper ? 54 : warm ? 66 : 92,
        letterSpacing: whisper ? 14 : 18,
        color: red || whisper ? C.red : warm ? '#ffe9b0' : C.white,
        opacity: on * fade * (whisper ? 0.85 : 1),
        transform: `scale(${scale}) translateX(${jitter}px)`,
        textShadow: red ? chroma(5) : warm ? '0 0 24px rgba(255,200,120,0.35)' : '0 0 18px rgba(160,180,255,0.25)',
      }}>{c.text}</div>
    </AbsoluteFill>
  );
};

const Strobe: React.FC = () => {
  const f = useCurrentFrame();
  const col = ['#ffffff', '#000000', '#ff1a1a', '#000000', '#ffffff', '#000000'][f % 6];
  return <AbsoluteFill style={{ backgroundColor: col }} />;
};

const Title: React.FC<{ c: Cut }> = ({ c }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, 4], [1.45, 1], { extrapolateRight: 'clamp' });
  const blur = interpolate(f, [0, 4], [18, 0], { extrapolateRight: 'clamp' });
  const split = interpolate(f, [0, 20], [26, 5], { extrapolateRight: 'clamp' });
  const shake = f < 12 ? (random(`ts${f}`) - 0.5) * (12 - f) * 3 : 0;
  const flick = f > 60 && random(`tf${f}`) < 0.06 ? 0.3 : 1;
  const sub = interpolate(f, [16, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = interpolate(f, [c.len - 8, c.len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 34, fontFamily: FONT, opacity: out }}>
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: interpolate(f, [0, 3], [0.9, 0], { extrapolateRight: 'clamp' }) }} />
      <div style={{ fontSize: 210, letterSpacing: 26, color: C.white, transform: `translateX(${shake}px) scale(${s})`, filter: `blur(${blur}px)`, textShadow: chroma(split), opacity: flick }}>NIGHT SHIFT</div>
      <div style={{ fontSize: 46, letterSpacing: 18, color: C.fg, opacity: sub }}>星光披萨乐园 · 夜班保安</div>
    </AbsoluteFill>
  );
};

const Stinger: React.FC<{ c: Cut }> = ({ c }) => {
  const f = useCurrentFrame();
  const q = interpolate(f, [c.len - 38, c.len - 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Shot c={{ ...c, push: 0.0035, light: 1.15 }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: BAR + 70, fontFamily: FONT }}>
        <div style={{ fontSize: 64, letterSpacing: 16, color: C.white, opacity: q, textShadow: '0 0 20px #000, 0 0 6px #000' }}>{c.text}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const AiFlash: React.FC<{ c: Cut }> = ({ c }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 6, c.len - 8, c.len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const b = interpolate(f, [14, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 30, fontFamily: FONT }}>
      <div style={{ fontSize: 30, letterSpacing: 10, color: C.dim, opacity: a }}>C:\SEC&gt; CREDITS.EXE</div>
      <div style={{ fontSize: 84, letterSpacing: 10, color: C.yellow, opacity: a }}>一个完全由 AI 生成的恐怖游戏 Demo</div>
      <div style={{ fontSize: 36, letterSpacing: 6, color: C.fg, opacity: a * b }}>代码 · 画面 · 声音 · 关卡与平衡 · 本宣传片 —— 全部由 Claude 制作</div>
    </AbsoluteFill>
  );
};

const Piece: React.FC<{ c: Cut }> = ({ c }) => {
  switch (c.kind) {
    case 'shot': return (
      <>
        <Shot c={c} />
        <Letterbox />
      </>
    );
    case 'text': return <Line c={c} />;
    case 'strobe': return <Strobe />;
    case 'title': return <Title c={c} />;
    case 'stinger': return (
      <>
        <Stinger c={c} />
        <Letterbox />
      </>
    );
    case 'ai': return <AiFlash c={c} />;
    case 'end': return <EndCard />;
    default: return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  }
};

export const Trailer: React.FC = () => {
  const { fps } = useVideoConfig();
  const cuts = timeline.cuts as Cut[];
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* one cut per timeline entry (the score is built from the same list) */}
      {cuts.map((c) => (
        <Sequence key={c.at} name={`${c.kind}${c.src ? ' ' + c.src : ''}${c.text ? ' ' + c.text : ''}`} from={c.at} durationInFrames={c.len} premountFor={fps}>
          <Piece c={c} />
        </Sequence>
      ))}
      <Grain />
      <Audio src={staticFile('score.wav')} />
    </AbsoluteFill>
  );
};

export const TRAILER_FRAMES = timeline.duration;
