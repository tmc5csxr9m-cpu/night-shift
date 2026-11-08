import React from 'react';
import { Composition, Folder } from 'remotion';
import { Trailer } from './Trailer';
import { AiCard, EndCard, TitleCard } from './Cards';
import { loadFont } from './theme';

loadFont();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} width={1920} height={1080} fps={30} durationInFrames={1490} />
    <Folder name="Cards">
      <Composition id="TitleCard" component={TitleCard} width={1920} height={1080} fps={30} durationInFrames={120} />
      <Composition id="AiCard" component={AiCard} width={1920} height={1080} fps={30} durationInFrames={150} />
      <Composition id="EndCard" component={EndCard} width={1920} height={1080} fps={30} durationInFrames={180} />
    </Folder>
  </>
);
