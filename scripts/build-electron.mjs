import { build } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // koffi's JS is bundled; its native binary ships in resources/koffi (see package.json extraResources)
  // and is found there through process.resourcesPath, so the @koromix packages stay external.
  external: ['electron', '@koromix/*'],
  outdir: 'dist-electron',
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts', 'electron/preload.ts'] });
if (watch) console.log('electron bundle built');
