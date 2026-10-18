import { Capacitor } from '@capacitor/core';
import { createMobileBridge } from '../mobile/bridge';
/** Bridge to the Electron main process, with a browser fallback for development/tests. */
export type DockEdge = 'left' | 'right' | null;
export interface DockState {
  edge: DockEdge;
  /** 'appbar' = Windows reserves the space; 'snap' = only positioned at the edge. */
  mode: 'appbar' | 'snap' | null;
}
export type ThemePref = 'system' | 'light' | 'dark';

export interface SyncStatus {
  /** The sync folder (desktop) or Drive folder path (mobile), or null when not syncing. */
  folder: string | null;
  suggestion: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Mobile: signed-in Google account. */
  account?: string | null;
  state?: 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';
}

export interface SyncBridge {
  status(): Promise<SyncStatus>;
  chooseFolder(suggestion: string | null): Promise<string | null>;
  enable(folder: string, currentJson: string): Promise<{ status: SyncStatus; json: string }>;
  disable(currentJson: string): Promise<SyncStatus>;
  onStatus(cb: (s: SyncStatus) => void): () => void;
}


export interface StantonBridge {
  platform: string;
  loadData(): Promise<string | null>;
  saveData(json: string): Promise<boolean>;
  saveImage(bytes: Uint8Array, mime: string): Promise<string>;
  /** Data changed on another device (merged by the caller). */
  onRemoteData(cb: (json: string) => void): () => void;
  sync?: SyncBridge;
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
  onRemoteData() {
    return () => undefined;
  },
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
};

/** Electron prefixes errors thrown in the main process; show just the message. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** True inside the Android app (Capacitor). */
export const isMobile =
  typeof window !== 'undefined' && !window.stanton && (Capacitor.isNativePlatform() || new URLSearchParams(window.location.search).has('mobile'));

export const bridge: StantonBridge = (typeof window !== 'undefined' && window.stanton) || (isMobile ? createMobileBridge() : browserBridge);
export const isElectron = typeof window !== 'undefined' && !!window.stanton;
