import { contextBridge, ipcRenderer } from 'electron';

type DockEdge = 'left' | 'right' | null;
type DockState = { edge: DockEdge; mode: 'appbar' | 'snap' | null };

contextBridge.exposeInMainWorld('stanton', {
  platform: process.platform,
  loadData: (): Promise<string | null> => ipcRenderer.invoke('data:load'),
  saveData: (json: string): Promise<boolean> => ipcRenderer.invoke('data:save', json),
  onRemoteData: (cb: (json: string) => void) => {
    const l = (_: unknown, json: string) => cb(json);
    ipcRenderer.on('data:remote', l);
    return () => ipcRenderer.removeListener('data:remote', l);
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    chooseFolder: (suggestion: string | null) => ipcRenderer.invoke('sync:choose-folder', suggestion),
    enable: (folder: string, currentJson: string) => ipcRenderer.invoke('sync:enable', folder, currentJson),
    disable: (currentJson: string) => ipcRenderer.invoke('sync:disable', currentJson),
    onStatus: (cb: (s: unknown) => void) => {
      const l = (_: unknown, s: unknown) => cb(s);
      ipcRenderer.on('sync:status', l);
      return () => ipcRenderer.removeListener('sync:status', l);
    },
  },
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
  setMinimizeToTray: (on: boolean) => ipcRenderer.invoke('tray:set', on),
  saveFile: (name: string, content: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> => ipcRenderer.invoke('file:save', name, content, filters),
  openFile: (filters: { name: string; extensions: string[] }[]): Promise<{ name: string; content: string } | null> => ipcRenderer.invoke('file:open', filters),
});
