/** Bridge to the Electron main process, with a browser fallback for development/tests. */
export type DockEdge = 'left' | 'right' | null;
export interface DockState {
  edge: DockEdge;
  /** 'appbar' = Windows reserves the space; 'snap' = only positioned at the edge. */
  mode: 'appbar' | 'snap' | null;
}
export type ThemePref = 'system' | 'light' | 'dark';

export interface AiBridge {
  hasKey(): Promise<boolean>;
  setKey(key: string | null): Promise<boolean>;
  listModels(): Promise<{ id: string; label: string }[]>;
  generate(model: string, system: string, prompt: string): Promise<string>;
}

export interface StantonBridge {
  platform: string;
  loadData(): Promise<string | null>;
  saveData(json: string): Promise<boolean>;
  saveImage(bytes: Uint8Array, mime: string): Promise<string>;
  dock(edge: DockEdge): Promise<DockState>;
  getDock(): Promise<DockState>;
  onDockChanged(cb: (state: DockState) => void): () => void;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  openExternal(url: string): Promise<void>;
  setTheme(theme: ThemePref): Promise<void>;
  setMinimizeToTray(on: boolean): Promise<void>;
  /** Ask where to save, then write the file. Resolves to the saved path, or null if cancelled. */
  saveFile(name: string, content: string, filters: FileFilter[]): Promise<string | null>;
  openFile(filters: FileFilter[]): Promise<{ name: string; content: string } | null>;
  outlookEvents(offsetDays: number, days: number): Promise<CalendarEvent[]>;
  telegram: TelegramBridge;
  ai: AiBridge;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  /** Local time, yyyy-mm-ddTHH:mm:ss */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string[];
  agenda: string;
  teams: boolean;
}

export interface TelegramStatus {
  configured: boolean;
  botName: string | null;
  paired: boolean;
  chatName: string | null;
  pairingCode: string | null;
  /** Not connected this session because Stanton was stopped while connected last time. */
  suspended?: boolean;
}

export interface TelegramMessage {
  id: string;
  text: string;
  image?: string;
  from: string;
}

export interface TelegramBridge {
  status(): Promise<TelegramStatus>;
  setToken(token: string): Promise<TelegramStatus>;
  startPairing(): Promise<TelegramStatus>;
  unpair(): Promise<TelegramStatus>;
  disconnect(): Promise<TelegramStatus>;
  resume(): Promise<TelegramStatus>;
  onStatus(cb: (s: TelegramStatus) => void): () => void;
  onCommand(cb: (msg: TelegramMessage) => Promise<string>): () => void;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

declare global {
  interface Window {
    stanton?: StantonBridge;
  }
}

const STORAGE_KEY = 'stanton.data';

function blobToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
  });
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_STORAGE = 'stanton.geminiKey';

/** Browser fallback (dev/tests only). In the desktop app the key lives in the main process. */
async function geminiFetch(pathname: string, init: RequestInit = {}) {
  const key = localStorage.getItem(KEY_STORAGE);
  if (!key) throw new Error('No Google AI key saved. Add one in Settings.');
  const res = await fetch(`${GEMINI}${pathname}`, { ...init, headers: { 'content-type': 'application/json', 'x-goog-api-key': key } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
  return body;
}

const browserAi: AiBridge = {
  async hasKey() {
    return !!localStorage.getItem(KEY_STORAGE);
  },
  async setKey(key) {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return !!key;
  },
  async listModels() {
    const body = await geminiFetch('/models?pageSize=1000');
    return (body.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent') && /gemini/i.test(m.name))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName ?? m.name }));
  },
  async generate(model, system, prompt) {
    const body = await geminiFetch(`/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    });
    const text = (body?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  },
};

const browserBridge: StantonBridge = {
  platform: 'browser',
  async loadData() {
    return localStorage.getItem(STORAGE_KEY);
  },
  async saveData(json) {
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  },
  saveImage: blobToDataUrl,
  async dock() {
    return { edge: null, mode: null };
  },
  async getDock() {
    return { edge: null, mode: null };
  },
  onDockChanged() {
    return () => undefined;
  },
  minimize() {},
  toggleMaximize() {},
  close() {},
  async openExternal(url) {
    window.open(url, '_blank', 'noopener');
  },
  async setTheme() {},
  async setMinimizeToTray() {},
  async saveFile(name, content, filters) {
    const type = filters[0]?.extensions[0] === 'html' ? 'text/html' : filters[0]?.extensions[0] === 'md' ? 'text/markdown' : 'application/json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return name;
  },
  openFile(filters) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { name: f.name, content: await f.text() } : null);
      };
      input.click();
    });
  },
  async outlookEvents() {
    throw new Error('Outlook import works in the Stanton desktop app on Windows.');
  },
  telegram: {
    async status() {
      return { configured: false, botName: null, paired: false, chatName: null, pairingCode: null };
    },
    async setToken() {
      throw new Error('Telegram works in the Stanton desktop app.');
    },
    async startPairing() {
      throw new Error('Telegram works in the Stanton desktop app.');
    },
    async unpair() {
      return { configured: false, botName: null, paired: false, chatName: null, pairingCode: null };
    },
    async disconnect() {
      return { configured: false, botName: null, paired: false, chatName: null, pairingCode: null };
    },
    async resume() {
      return { configured: false, botName: null, paired: false, chatName: null, pairingCode: null };
    },
    onStatus() {
      return () => undefined;
    },
    onCommand() {
      return () => undefined;
    },
  },
  ai: browserAi,
};

/** Electron prefixes errors thrown in the main process; show just the message. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export const bridge: StantonBridge = (typeof window !== 'undefined' && window.stanton) || browserBridge;
export const isElectron = typeof window !== 'undefined' && !!window.stanton;
