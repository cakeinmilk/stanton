/** Bridge to the Electron main process, with a browser fallback for development/tests. */
export type DockEdge = 'left' | 'right' | null;

export interface StantonBridge {
  platform: string;
  loadData(): Promise<string | null>;
  saveData(json: string): Promise<boolean>;
  saveImage(bytes: Uint8Array, mime: string): Promise<string>;
  dock(edge: DockEdge): Promise<DockEdge>;
  getDock(): Promise<DockEdge>;
  onDockChanged(cb: (edge: DockEdge) => void): () => void;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  openExternal(url: string): Promise<void>;
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
  async dock() {
    return null;
  },
  async getDock() {
    return null;
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
};

export const bridge: StantonBridge = window.stanton ?? browserBridge;
export const isElectron = !!window.stanton;
