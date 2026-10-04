import { contextBridge, ipcRenderer } from 'electron';

type DockEdge = 'left' | 'right' | null;

contextBridge.exposeInMainWorld('stanton', {
  platform: process.platform,
  loadData: (): Promise<string | null> => ipcRenderer.invoke('data:load'),
  saveData: (json: string): Promise<boolean> => ipcRenderer.invoke('data:save', json),
  saveImage: (bytes: Uint8Array, mime: string): Promise<string> => ipcRenderer.invoke('image:save', bytes, mime),
  dock: (edge: DockEdge): Promise<DockEdge> => ipcRenderer.invoke('window:dock', edge),
  getDock: (): Promise<DockEdge> => ipcRenderer.invoke('window:get-dock'),
  onDockChanged: (cb: (edge: DockEdge) => void) => {
    const listener = (_: unknown, edge: DockEdge) => cb(edge);
    ipcRenderer.on('window:dock-changed', listener);
    return () => ipcRenderer.removeListener('window:dock-changed', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
});
