// Development: Vite dev server (hot reload) inside the desktop shell.
//   npm run dev
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`vite: ${url}`);

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, NS_DEV_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
