import { contextBridge, ipcRenderer } from 'electron';

type DockEdge = 'left' | 'right' | null;
type DockState = { edge: DockEdge; mode: 'appbar' | 'snap' | null };

contextBridge.exposeInMainWorld('stanton', {
  platform: process.platform,
  loadData: (): Promise<string | null> => ipcRenderer.invoke('data:load'),
  saveData: (json: string): Promise<boolean> => ipcRenderer.invoke('data:save', json),
  saveImage: (bytes: Uint8Array, mime: string): Promise<string> => ipcRenderer.invoke('image:save', bytes, mime),
  dock: (edge: DockEdge): Promise<DockState> => ipcRenderer.invoke('window:dock', edge),
  getDock: (): Promise<DockState> => ipcRenderer.invoke('window:get-dock'),
  onDockChanged: (cb: (state: DockState) => void) => {
    const listener = (_: unknown, state: DockState) => cb(state);
    ipcRenderer.on('window:dock-changed', listener);
    return () => ipcRenderer.removeListener('window:dock-changed', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  setTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', theme),
  ai: {
    hasKey: (): Promise<boolean> => ipcRenderer.invoke('ai:has-key'),
    setKey: (key: string | null): Promise<boolean> => ipcRenderer.invoke('ai:set-key', key),
    listModels: (): Promise<{ id: string; label: string }[]> => ipcRenderer.invoke('ai:list-models'),
    generate: (model: string, system: string, prompt: string): Promise<string> => ipcRenderer.invoke('ai:generate', model, system, prompt),
  },
});
