import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/** Add a strict Content-Security-Policy to the production build only (Vite's dev server needs inline scripts). */
const csp = (mobile: boolean): Plugin => ({
  name: 'stanton-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: stanton: https: http:; font-src 'self' data:; connect-src 'self' stanton:${mobile ? ' https://www.googleapis.com https://oauth2.googleapis.com' : ''}" />`,
    ),
});

// `vite build --mode mobile` builds the Android app's web layer (allowed to talk to Google Drive).
export default defineConfig(({ mode }) => ({
  plugins: [react(), csp(mode === 'mobile')],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
}));
