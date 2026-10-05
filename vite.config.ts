import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Add a strict Content-Security-Policy to the production build only (Vite's dev server needs inline scripts). */
const csp = (): Plugin => ({
  name: 'stanton-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: stanton: https: http:; font-src 'self' data:; connect-src 'self' stanton: https://generativelanguage.googleapis.com" />`,
    ),
});

export default defineConfig({
  plugins: [react(), csp()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
