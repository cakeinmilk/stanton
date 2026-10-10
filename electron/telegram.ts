/**
 * Telegram bridge: message Stanton from your phone.
 *
 * You create your own bot with @BotFather and paste its token into Settings. While Stanton
 * runs (including minimised to the tray) it long-polls Telegram for messages. Only the one
 * chat that paired with a one-time code is listened to. Telegram keeps undelivered messages
 * for 24 hours, so notes sent while the PC is off arrive when Stanton next starts.
 *
 * The main process only moves messages; the renderer decides what they do (e.g. add a
 * Scratchpad note) and returns the reply text.
 */
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { log } from './log';

const file = () => path.join(app.getPath('userData'), 'telegram.json');
/** Present while connected; removed on a clean exit. If it's still there at start-up, the last run was killed. */
const runningMarker = () => path.join(app.getPath('userData'), 'telegram.running');
let suspended = false;

interface Stored {
  token?: string; // encrypted (base64) when `encrypted`
  encrypted?: boolean;
  botName?: string;
  chatId?: number;
  chatName?: string;
  offset?: number;
}

let stored: Stored = {};
let token: string | null = null;
let pairingCode: string | null = null;
let polling = false;
let stopRequested = false;
let controller: AbortController | null = null;
let getWin: () => BrowserWindow | null = () => null;
let saveImageBytes: (bytes: Buffer, mime: string) => Promise<string> = async () => '';
const pending = new Map<string, (reply: string) => void>();

async function load() {
  try {
    stored = JSON.parse(await fs.readFile(file(), 'utf8'));
    if (stored.token) {
      const buf = Buffer.from(stored.token, 'base64');
      token = stored.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8');
    }
  } catch {
    stored = {};
  }
}

async function save() {
  await fs.writeFile(file(), JSON.stringify(stored));
}

async function api(method: string, body?: object, signal?: AbortSignal): Promise<any> {
  if (!token) throw new Error('No bot token');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `Telegram error ${res.status}`);
  return json.result;
}

const send = (chatId: number, text: string) =>
  api('sendMessage', { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }).catch((e) => log('Telegram send failed', e.message));

/** Ask the renderer to handle a message; it answers through 'telegram:reply'. */
function handleInRenderer(msg: { text: string; image?: string; from: string }): Promise<string> {
  const win = getWin();
  if (!win || win.isDestroyed()) return Promise.resolve('Stanton is closing – try again in a moment.');
  const id = randomUUID();
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      pending.delete(id);
      resolve('Stanton is busy – please try again.');
    }, 20000);
    pending.set(id, (reply) => {
      clearTimeout(t);
      resolve(reply);
    });
    win.webContents.send('telegram:command', { id, ...msg });
  });
}

async function downloadPhoto(photos: any[]): Promise<string | undefined> {
  const best = photos[photos.length - 1];
  if (!best) return undefined;
  const info = await api('getFile', { file_id: best.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return saveImageBytes(bytes, /\.png$/i.test(info.file_path) ? 'image/png' : 'image/jpeg');
}

async function onUpdate(u: any) {
  const m = u.message ?? u.edited_message;
  if (!m || !m.chat) return;
  const chatId: number = m.chat.id;
  const text: string = (m.text ?? m.caption ?? '').trim();
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.chat.title || 'you';

  if (stored.chatId !== chatId) {
    // Not paired: accept only "/start <code>" (or the bare code) while pairing is open.
    const code = text.replace(/^\/start\s*/i, '').trim();
    if (pairingCode && code === pairingCode) {
      stored.chatId = chatId;
      stored.chatName = name;
      pairingCode = null;
      await save();
      getWin()?.webContents.send('telegram:status', status());
      await send(chatId, `✅ Paired with Stanton. Send me anything and it goes to your Scratchpad.\nType /help to see what else I can do.`);
    } else {
      await send(chatId, 'This is a private Stanton bot. To connect, open Stanton → Settings → Telegram and use the pairing link.');
    }
    return;
  }

  let image: string | undefined;
  if (m.photo?.length) {
    try {
      image = await downloadPhoto(m.photo);
    } catch (e: any) {
      log('Telegram photo download failed', e.message);
    }
  }
  if (!text && !image) {
    await send(chatId, "I can take text and photos. Type /help for commands.");
    return;
  }
  const reply = await handleInRenderer({ text, image, from: name });
  await send(chatId, reply);
}

async function pollLoop() {
  if (polling || !token) return;
  polling = true;
  suspended = false;
  stopRequested = false;
  await fs.writeFile(runningMarker(), new Date().toISOString()).catch(() => undefined);
  let backoff = 2000;
  log('Telegram polling started');
  while (!stopRequested && token) {
    controller = new AbortController();
    try {
      const updates: any[] = await api('getUpdates', { offset: stored.offset ?? 0, timeout: 50, allowed_updates: ['message', 'edited_message'] }, controller.signal);
      backoff = 2000;
      for (const u of updates) {
        stored.offset = u.update_id + 1;
        await save();
        try {
          await onUpdate(u);
        } catch (e: any) {
          log('Telegram update failed', e.message);
        }
      }
    } catch (e: any) {
      if (stopRequested) break;
      log('Telegram poll error', e.message);
      // 401 = token revoked; stop rather than hammering the API.
      if (/Unauthorized/i.test(e.message)) break;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60000);
    }
  }
  polling = false;
  await fs.rm(runningMarker(), { force: true }).catch(() => undefined);
  log('Telegram polling stopped');
}

function stop() {
  stopRequested = true;
  controller?.abort();
}

function status() {
  return {
    configured: !!token,
    botName: stored.botName ?? null,
    paired: !!stored.chatId,
    chatName: stored.chatName ?? null,
    pairingCode,
    suspended,
  };
}

export async function initTelegram(win: () => BrowserWindow | null, saveImage: (bytes: Buffer, mime: string) => Promise<string>) {
  getWin = win;
  saveImageBytes = saveImage;
  await load();

  ipcMain.handle('telegram:status', () => status());
  ipcMain.handle('telegram:set-token', async (_e, newToken: string) => {
    stop();
    token = newToken.trim();
    try {
      const me = await api('getMe');
      const encrypted = safeStorage.isEncryptionAvailable();
      stored = {
        token: (encrypted ? safeStorage.encryptString(token) : Buffer.from(token, 'utf8')).toString('base64'),
        encrypted,
        botName: me.username,
      };
      await save();
      void pollLoop();
      return status();
    } catch (e: any) {
      token = null;
      await load();
      if (token) void pollLoop();
      throw new Error(`Telegram didn't accept that token: ${e.message}`);
    }
  });
  ipcMain.handle('telegram:start-pairing', () => {
    pairingCode = String(randomInt(100000, 999999));
    return status();
  });
  ipcMain.handle('telegram:unpair', async () => {
    delete stored.chatId;
    delete stored.chatName;
    await save();
    return status();
  });
  ipcMain.handle('telegram:disconnect', async () => {
    stop();
    token = null;
    pairingCode = null;
    suspended = false;
    stored = {};
    await fs.rm(file(), { force: true });
    await fs.rm(runningMarker(), { force: true });
    return status();
  });
  ipcMain.handle('telegram:resume', () => {
    void pollLoop();
    return { ...status(), suspended: false };
  });
  ipcMain.handle('telegram:reply', (_e, id: string, reply: string) => {
    pending.get(id)?.(reply);
    pending.delete(id);
  });

  // If the previous run ended while connected (e.g. a security tool stopped Stanton),
  // don't reconnect automatically – that would just get Stanton stopped again on every start.
  let crashed = false;
  try {
    await fs.access(runningMarker());
    crashed = true;
  } catch {
    /* clean exit last time */
  }
  if (token && crashed) {
    suspended = true;
    log('Telegram not started: Stanton did not exit cleanly last time while connected to Telegram');
  } else if (token) {
    void pollLoop();
  }
}

/** Clean shutdown: stop polling and clear the "running" marker synchronously before quitting. */
export function stopTelegram() {
  stop();
  try {
    rmSync(runningMarker(), { force: true });
  } catch {
    /* ignore */
  }
}
