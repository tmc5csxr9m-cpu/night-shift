// The trailer uses the game's own font and sounds: copy them in from the
// game (../public) instead of keeping duplicates in git.
import { copyFileSync, mkdirSync } from 'node:fs';

const SFX = ['tension', 'ambience', 'thud', 'horn', 'scream', 'bell6', 'musicbox', 'thunder', 'step_heavy', 'step_light', 'greet_sunny', 'greet_pip', 'relay', 'zap', 'chime', 'heartbeat', 'duct', 'back_breath', 'creak', 'servo'];
mkdirSync('public/sfx', { recursive: true });
mkdirSync('public/fonts', { recursive: true });
copyFileSync('../public/fonts/unifont.otf', 'public/fonts/unifont.otf');
for (const s of SFX) copyFileSync(`../public/audio/${s}.ogg`, `public/sfx/${s}.ogg`);
console.log(`copied unifont + ${SFX.length} sounds`);
