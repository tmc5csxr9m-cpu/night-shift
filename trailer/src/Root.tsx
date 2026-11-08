import React from 'react';
import { Composition } from 'remotion';
import { Trailer, TRAILER_FRAMES } from './Trailer';
import { EndCard } from './Cards';
import { loadFont } from './theme';

loadFont();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} width={1920} height={1080} fps={30} durationInFrames={TRAILER_FRAMES} />
    <Composition id="EndCard" component={EndCard} width={1920} height={1080} fps={30} durationInFrames={180} />
  </>
);
