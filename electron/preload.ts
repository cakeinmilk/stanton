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
  setMinimizeToTray: (on: boolean) => ipcRenderer.invoke('tray:set', on),
  saveFile: (name: string, content: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> => ipcRenderer.invoke('file:save', name, content, filters),
  openFile: (filters: { name: string; extensions: string[] }[]): Promise<{ name: string; content: string } | null> => ipcRenderer.invoke('file:open', filters),
  outlookEvents: (offsetDays: number, days: number) => ipcRenderer.invoke('outlook:events', offsetDays, days),
  telegram: {
    status: () => ipcRenderer.invoke('telegram:status'),
    setToken: (token: string) => ipcRenderer.invoke('telegram:set-token', token),
    startPairing: () => ipcRenderer.invoke('telegram:start-pairing'),
    unpair: () => ipcRenderer.invoke('telegram:unpair'),
    disconnect: () => ipcRenderer.invoke('telegram:disconnect'),
    resume: () => ipcRenderer.invoke('telegram:resume'),
    onStatus: (cb: (s: unknown) => void) => {
      const l = (_: unknown, s: unknown) => cb(s);
      ipcRenderer.on('telegram:status', l);
      return () => ipcRenderer.removeListener('telegram:status', l);
    },
    onCommand: (cb: (msg: { id: string; text: string; image?: string; from: string }) => Promise<string>) => {
      const l = async (_: unknown, msg: { id: string; text: string; image?: string; from: string }) => {
        let reply = '';
        try {
          reply = await cb(msg);
        } catch (e) {
          reply = `Sorry, something went wrong: ${(e as Error).message}`;
        }
        void ipcRenderer.invoke('telegram:reply', msg.id, reply);
      };
      ipcRenderer.on('telegram:command', l);
      return () => ipcRenderer.removeListener('telegram:command', l);
    },
  },
  ai: {
    hasKey: (): Promise<boolean> => ipcRenderer.invoke('ai:has-key'),
    setKey: (key: string | null): Promise<boolean> => ipcRenderer.invoke('ai:set-key', key),
    listModels: (): Promise<{ id: string; label: string }[]> => ipcRenderer.invoke('ai:list-models'),
    generate: (model: string, system: string, prompt: string): Promise<string> => ipcRenderer.invoke('ai:generate', model, system, prompt),
  },
});
