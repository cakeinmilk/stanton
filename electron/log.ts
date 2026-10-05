import { app } from 'electron';
import { appendFileSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';

/** Tiny append-only log in %APPDATA%\Stanton\stanton.log for diagnosing problems on users' machines. */
export function log(...parts: unknown[]) {
  const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? p.stack ?? p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  try {
    const file = path.join(app.getPath('userData'), 'stanton.log');
    try {
      if (statSync(file).size > 512 * 1024) renameSync(file, `${file}.old`);
    } catch {
      /* no log yet */
    }
    appendFileSync(file, line);
  } catch {
    /* logging must never break the app */
  }
  console.log(line.trimEnd());
}
