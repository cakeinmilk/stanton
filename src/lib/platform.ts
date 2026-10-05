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
  ai: AiBridge;
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
  ai: browserAi,
};

/** Electron prefixes errors thrown in the main process; show just the message. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export const bridge: StantonBridge = window.stanton ?? browserBridge;
export const isElectron = !!window.stanton;
