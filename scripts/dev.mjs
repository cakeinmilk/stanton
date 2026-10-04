// Starts the Vite dev server, bundles the Electron main process and launches Electron.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

await new Promise((resolve, reject) => {
  const p = spawn(process.execPath, ['scripts/build-electron.mjs'], { stdio: 'inherit' });
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('electron build failed'))));
});

const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('exit', async () => {
  await server.close();
  process.exit(0);
});
