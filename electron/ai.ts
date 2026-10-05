/**
 * Google Gemini access for the weekly plan. The API key comes from Google AI
 * Studio (sign in with a Google account → "Get API key"). It is encrypted with
 * the OS keychain (DPAPI on Windows) via safeStorage and never sent to the renderer.
 */
import { app, ipcMain, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from './log';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

async function readKey(): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(secretsFile(), 'utf8'));
    if (!raw.geminiKey) return null;
    const buf = Buffer.from(raw.geminiKey, 'base64');
    return raw.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch {
    return null;
  }
}

async function writeKey(key: string | null) {
  if (!key) {
    await fs.rm(secretsFile(), { force: true });
    return;
  }
  const encrypted = safeStorage.isEncryptionAvailable();
  const buf = encrypted ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  await fs.writeFile(secretsFile(), JSON.stringify({ geminiKey: buf.toString('base64'), encrypted }));
}

async function call(pathname: string, init: RequestInit = {}): Promise<any> {
  const key = await readKey();
  if (!key) throw new Error('No Google AI key saved. Add one in Settings.');
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...(init.headers ?? {}) },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? `${res.status} ${res.statusText}`;
    log('Gemini error', res.status, msg);
    throw new Error(msg);
  }
  return body;
}

export async function listModels(): Promise<{ id: string; label: string }[]> {
  const body = await call('/models?pageSize=1000');
  return (body.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent') && /gemini/i.test(m.name))
    .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName ?? m.name }));
}

export async function generate(model: string, system: string, prompt: string): Promise<string> {
  const body = await call(`/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  });
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: any) => p.text ?? '').join('').trim();
  if (!text) throw new Error(body?.promptFeedback?.blockReason ? `Blocked: ${body.promptFeedback.blockReason}` : 'Gemini returned an empty response.');
  return text;
}

export function registerAiIpc() {
  ipcMain.handle('ai:has-key', async () => !!(await readKey()));
  ipcMain.handle('ai:set-key', async (_e, key: string | null) => {
    await writeKey(key?.trim() || null);
    return !!key;
  });
  ipcMain.handle('ai:list-models', () => listModels());
  ipcMain.handle('ai:generate', (_e, model: string, system: string, prompt: string) => generate(model, system, prompt));
}
