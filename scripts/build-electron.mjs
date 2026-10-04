import { build } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'koffi'],
  outdir: 'dist-electron',
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts', 'electron/preload.ts'] });
if (watch) console.log('electron bundle built');
