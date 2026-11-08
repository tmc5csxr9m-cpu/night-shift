// Look of the trailer cards: the game's own CRT palette and font (GNU Unifont).
// Card layouts follow the Claude Design canvas "NIGHT SHIFT 宣传片视觉设计".
import { continueRender, delayRender, staticFile } from 'remotion';

export const C = {
  black: '#000000',
  blue: '#0d1b8c',
  panel: '#07105e',
  fg: '#c3d1ff',
  dim: '#6b7fd6',
  dim2: '#3d52b0',
  white: '#f2f4ff',
  ink: '#0a1470',
  cyan: '#7fe3ff',
  yellow: '#ffe56b',
  red: '#ff4a4a',
};

export const FONT = "'Unifont', monospace";

export const REPO = 'github.com/tmc5csxr9m-cpu/night-shift';

// the font must be ready before a frame is captured
let loaded = false;
export function loadFont() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('Unifont');
  const face = new FontFace('Unifont', `url(${staticFile('fonts/unifont.otf')})`);
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

// RGB-split "CRT" glow used on the big titles
export const chroma = (px: number) => `${px}px 0 rgba(255,40,40,0.55), ${-px}px 0 rgba(40,120,255,0.55), 0 0 40px rgba(120,150,255,0.45)`;
