// Release builds. There are exactly four artifacts:
//   NightShift-<ver>-win-x64.exe              release (no debug mode, no DevTools)
//   NightShift-<ver>-linux-x86_64.AppImage    release
//   NightShift-<ver>-dev-win-x64.exe          dev: debug mode + info panel (F1), DevTools (F12)
//   NightShift-<ver>-dev-linux-x86_64.AppImage dev
// The channel is baked into the packaged package.json (extraMetadata) and
// read by electron/main.cjs.
//   node tools/build.mjs [win|linux|all] [release|dev|all]
// The Windows exe is built on Linux too (wine stamps the icon / version info).
import { execFileSync } from 'node:child_process';

const [platform = 'all', channel = 'all'] = process.argv.slice(2);
const platforms = platform === 'all' ? ['win', 'linux'] : [platform];
const channels = channel === 'all' ? ['release', 'dev'] : [channel];
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

run('npx', ['vite', 'build']);
run('node', ['tools/gen_licenses.mjs']);
for (const p of platforms) {
  for (const c of channels) {
    const tag = c === 'dev' ? '-dev' : '';
    const name = p === 'win' ? `NightShift-\${version}${tag}-win-x64.exe` : `NightShift-\${version}${tag}-linux-x86_64.AppImage`;
    console.log(`\n=== ${p} / ${c} ===`);
    run('npx', ['electron-builder', p === 'win' ? '--win' : '--linux', '--x64', '--publish', 'never',
      `-c.extraMetadata.channel=${c}`, `-c.${p}.artifactName=${name}`]);
  }
}
