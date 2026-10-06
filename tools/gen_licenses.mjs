// Collect the third-party notices shipped next to the executable.
//   node tools/gen_licenses.mjs  ->  build/LICENSES.txt
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8').trim();
const pkg = JSON.parse(read('package.json'));
const parts = [
  `NIGHT SHIFT ${pkg.version}
© 2026 @g_t_u (bilibili). All rights reserved. / 保留所有权利。
本作由 AI (Anthropic Claude) 制作。This game was made with AI (Anthropic Claude).
FNAF fan game. Not affiliated with Scott Cawthon or Five Nights at Freddy's.

This program includes the third-party components listed below.
Chromium's own notices are in LICENSES.chromium.html.`,
  `==== GNU Unifont 18.0.01 (fonts/unifont.otf) ====
Copyright © 1998-2026 Roman Czyborra, Paul Hardy, Qianqian Fang, Andrew Miller,
Johnnie Weaver, David Corbett, Ælla Chiana Moskopp, Rebecca Bettencourt, Ho-Seok Ee, et al.
Dual license: SIL Open Font License 1.1, and GNU GPL version 2 or later with the
GNU Font Embedding Exception. Distributed here under the SIL Open Font License 1.1:

${read('build/licenses/OFL-1.1.txt')}`,
  `==== three.js ====\n${read('node_modules/three/LICENSE')}`,
  `==== Electron ====\n${read('node_modules/electron/LICENSE')}`,
];
writeFileSync('build/LICENSES.txt', parts.join('\n\n\n') + '\n');
console.log('build/LICENSES.txt');
