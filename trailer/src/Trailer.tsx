// NIGHT SHIFT trailer: real gameplay cut fast against beat cards, then the
// title, the "made entirely by AI" card and where to download it.
// Every sound comes from the game itself (public/sfx = the game's audio).
import React from 'react';
import { Audio } from '@remotion/media';
import { AbsoluteFill, Sequence, Series, staticFile, useVideoConfig } from 'remotion';
import { AiCard, BeatCard, EndCard, TitleCard } from './Cards';
import { Caption, Flash, Shot } from './Clip';
import { C } from './theme';

const sfx = (name: string) => staticFile(`sfx/${name}.ogg`);

export const Trailer: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        <Series.Sequence name="Intro 12:00 AM" durationInFrames={54} premountFor={fps}>
          <Shot src="intro" from={6} />
        </Series.Sequence>
        <Series.Sequence name="Beat 没有监控" durationInFrames={36} premountFor={fps}>
          <BeatCard text="没有监控" />
        </Series.Sequence>
        <Series.Sequence name="Sunny" durationInFrames={96} premountFor={fps}>
          <Shot src="sunny" from={14}>
            <Caption n="01" title="开灯, 盯住它" sub="左门的熊只在被你盯着时退后" />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Beat 只有声音" durationInFrames={36} premountFor={fps}>
          <BeatCard text="只有声音" />
        </Series.Sequence>
        <Series.Sequence name="Pip" durationInFrames={72} premountFor={fps}>
          <Shot src="pip" from={16}>
            <Caption n="02" title="灯赶不走它" sub="右门的兔子跟着声音走" />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Beat 和一台终端" durationInFrames={36} premountFor={fps}>
          <BeatCard text="和一台终端" tone="blue" />
        </Series.Sequence>
        <Series.Sequence name="Map" durationInFrames={90} premountFor={fps}>
          <Shot src="map" from={8}>
            <Caption n="03" title="扫描 · 诱饵 · 照明" sub="终端是你唯一的眼睛" />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Vent" durationInFrames={66} premountFor={fps}>
          <Shot src="vent" from={30} light={2.2}>
            <Caption n="04" title="通风口里有东西" />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Thunder" durationInFrames={45} premountFor={fps}>
          <Shot src="thunder" from={12} light={1.5}>
            <Caption title="雷暴 · 停电" />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Beat 它在看着你" durationInFrames={42} premountFor={fps}>
          <BeatCard text="它在看着你" tone="red" />
        </Series.Sequence>
        <Series.Sequence name="Breaker" durationInFrames={66} premountFor={fps}>
          <Shot src="breaker" from={10}>
            <Caption n="05" title="第 6 夜 · STARLIGHT" sub="它接管了配电、传感器和你的终端" accent={C.red} />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Access denied" durationInFrames={36} premountFor={fps}>
          <Shot src="denied" from={0} />
        </Series.Sequence>
        <Series.Sequence name="Hand winding" durationInFrames={72} premountFor={fps}>
          <Shot src="wind" from={12} light={2.4}>
            <Caption n="06" title="亲手上发条" sub="遥控绞盘被它占了" accent={C.red} />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Clock stuck" durationInFrames={54} premountFor={fps}>
          <Shot src="stuckclock" from={10}>
            <Caption title="时间停在 05:59" sub="直到你把它赶出去" accent={C.red} />
          </Shot>
        </Series.Sequence>
        <Series.Sequence name="Jumpscare" durationInFrames={45} premountFor={fps}>
          <Shot src="jumpscare" from={6} />
        </Series.Sequence>
        <Series.Sequence name="Black" durationInFrames={20} premountFor={fps}>
          <AbsoluteFill style={{ backgroundColor: '#000' }} />
        </Series.Sequence>
        <Series.Sequence name="N6 end: last words" durationInFrames={60} premountFor={fps}>
          <Shot src="n6end" from={20} />
        </Series.Sequence>
        <Series.Sequence name="N6 end: 05:59" durationInFrames={54} premountFor={fps}>
          <Shot src="n6end" from={170} />
        </Series.Sequence>
        <Series.Sequence name="N6 end: lights" durationInFrames={60} premountFor={fps}>
          <Shot src="n6end" from={232} />
        </Series.Sequence>
        <Series.Sequence name="Title" durationInFrames={120} premountFor={fps}>
          <TitleCard />
        </Series.Sequence>
        <Series.Sequence name="Made by AI" durationInFrames={150} premountFor={fps}>
          <AiCard />
        </Series.Sequence>
        <Series.Sequence name="Download" durationInFrames={180} premountFor={fps}>
          <EndCard />
        </Series.Sequence>
      </Series>

      {/* cut accents */}
      <Sequence name="Flash sunny" from={90} durationInFrames={6}><Flash /></Sequence>
      <Sequence name="Flash red" from={531} durationInFrames={6}><Flash color="#ff2020" /></Sequence>
      <Sequence name="Flash jumpscare" from={813} durationInFrames={6}><Flash /></Sequence>

      {/* ---- sound: beds */}
      <Sequence name="Bed tension" from={0} durationInFrames={801}>
        <Audio src={sfx('tension')} loop volume={0.55} />
      </Sequence>
      <Sequence name="Bed ambience" from={0} durationInFrames={1040}>
        <Audio src={sfx('ambience')} volume={0.35} />
      </Sequence>
      {/* ---- sound: hits */}
      <Sequence name="Hit beat 1" from={54} durationInFrames={60}><Audio src={sfx('thud')} volume={1} /></Sequence>
      <Sequence name="Sunny step" from={92} durationInFrames={30}><Audio src={sfx('step_heavy')} volume={0.9} /></Sequence>
      <Sequence name="Sunny relay" from={100} durationInFrames={20}><Audio src={sfx('relay')} volume={0.8} /></Sequence>
      <Sequence name="Sunny greet" from={112} durationInFrames={60}><Audio src={sfx('greet_sunny')} volume={0.9} /></Sequence>
      <Sequence name="Hit beat 2" from={186} durationInFrames={60}><Audio src={sfx('thud')} volume={1} /></Sequence>
      <Sequence name="Pip greet" from={228} durationInFrames={45}><Audio src={sfx('greet_pip')} volume={0.9} /></Sequence>
      <Sequence name="Hit beat 3" from={294} durationInFrames={60}><Audio src={sfx('thud')} volume={1} /></Sequence>
      <Sequence name="Map chime" from={392} durationInFrames={90}><Audio src={sfx('chime')} volume={0.7} /></Sequence>
      <Sequence name="Vent duct" from={424} durationInFrames={50}><Audio src={sfx('duct')} volume={1} /></Sequence>
      <Sequence name="Thunder" from={486} durationInFrames={120}><Audio src={sfx('thunder')} volume={0.8} /></Sequence>
      <Sequence name="Red horn" from={531} durationInFrames={45}><Audio src={sfx('horn')} volume={0.9} playbackRate={0.55} /></Sequence>
      <Sequence name="Breaker relay" from={590} durationInFrames={20}><Audio src={sfx('relay')} volume={0.9} /></Sequence>
      <Sequence name="Breaker zap" from={606} durationInFrames={20}><Audio src={sfx('zap')} volume={0.8} /></Sequence>
      <Sequence name="Denied zap" from={639} durationInFrames={20}><Audio src={sfx('zap')} volume={1} /></Sequence>
      <Sequence name="Music box" from={675} durationInFrames={72}><Audio src={sfx('musicbox')} volume={0.8} /></Sequence>
      <Sequence name="Heartbeat" from={747} durationInFrames={54}><Audio src={sfx('heartbeat')} loop volume={1} /></Sequence>
      <Sequence name="Scream" from={812} durationInFrames={50}><Audio src={sfx('scream')} volume={0.55} /></Sequence>
      <Sequence name="N6 thud" from={866} durationInFrames={70}><Audio src={sfx('thud')} volume={1} playbackRate={0.5} /></Sequence>
      <Sequence name="N6 breath" from={880} durationInFrames={60}><Audio src={sfx('back_breath')} volume={0.6} /></Sequence>
      <Sequence name="N6 music box clean" from={926} durationInFrames={250}><Audio src={sfx('musicbox')} volume={0.75} /></Sequence>
      <Sequence name="Bell 1" from={954} durationInFrames={90}><Audio src={sfx('bell6')} volume={1} /></Sequence>
      <Sequence name="Bell 2" from={980} durationInFrames={90}><Audio src={sfx('bell6')} volume={0.9} /></Sequence>
      <Sequence name="Bell 3" from={1004} durationInFrames={90}><Audio src={sfx('bell6')} volume={0.8} /></Sequence>
      <Sequence name="Lights relay" from={990} durationInFrames={20}><Audio src={sfx('relay')} volume={0.9} /></Sequence>
      <Sequence name="Title hit" from={1040} durationInFrames={90}><Audio src={sfx('thud')} volume={1} playbackRate={0.7} /></Sequence>
      <Sequence name="Credits ticks" from={1160} durationInFrames={30}><Audio src={sfx('relay')} volume={0.5} playbackRate={2} /></Sequence>
      <Sequence name="Credits hit" from={1194} durationInFrames={60}><Audio src={sfx('thud')} volume={0.7} /></Sequence>
      <Sequence name="End creak" from={1310} durationInFrames={110}><Audio src={sfx('creak')} volume={0.5} /></Sequence>
    </AbsoluteFill>
  );
};
