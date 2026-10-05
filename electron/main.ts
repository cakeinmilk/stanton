import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, Rectangle, screen, shell } from 'electron';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DockController, DockEdge } from './appbar';
import { registerAiIpc } from './ai';
import { log } from './log';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: 'stanton', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const dataDir = () => path.join(app.getPath('userData'), 'data');
const dataFile = () => path.join(dataDir(), 'stanton.json');
const imagesDir = () => path.join(dataDir(), 'images');
const settingsFile = () => path.join(app.getPath('userData'), 'window.json');

interface WindowSettings {
  bounds?: Rectangle;
  dock?: DockEdge | null;
  dockWidth?: number;
  theme?: 'system' | 'light' | 'dark';
}

function readSettings(): WindowSettings {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeSettings(s: WindowSettings) {
  await fs.writeFile(settingsFile(), JSON.stringify(s, null, 2));
}

/** Atomic write: write a temp file then rename over the original. */
async function writeAtomic(file: string, contents: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  if (existsSync(file)) await fs.copyFile(file, `${file}.bak`).catch(() => undefined);
  await fs.rename(tmp, file);
}

let win: BrowserWindow | null = null;
let dock: DockController | null = null;
let settings: WindowSettings = {};
let floatingBounds: Rectangle | undefined;

function boundsAreVisible(b: Rectangle) {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
  });
}

const dockState = () => ({ edge: dock?.dockedEdge ?? null, mode: dock?.mode ?? null });

function sendDockState() {
  win?.webContents.send('window:dock-changed', dockState());
}

function createWindow() {
  settings = readSettings();
  nativeTheme.themeSource = settings.theme ?? 'system';
  const defaults: Rectangle = { x: 0, y: 0, width: 1100, height: 760 };
  floatingBounds = settings.bounds && boundsAreVisible(settings.bounds) ? settings.bounds : undefined;

  win = new BrowserWindow({
    ...(floatingBounds ?? { width: defaults.width, height: defaults.height }),
    minWidth: 280,
    minHeight: 400,
    frame: false,
    show: false,
    title: 'Stanton',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a1e1e' : '#f3fafa',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  dock = new DockController(win);

  win.once('ready-to-show', () => {
    win?.show();
    if (settings.dock) {
      dock?.dock(settings.dock, settings.dockWidth);
      sendDockState();
    }
  });

  const remember = () => {
    if (!win || win.isMaximized() || win.isMinimized()) return;
    if (dock?.dockedEdge) {
      settings.dockWidth = dock.dockedWidth;
    } else {
      floatingBounds = win.getBounds();
      settings.bounds = floatingBounds;
    }
    void writeSettings(settings);
  };
  win.on('resized', remember);
  win.on('moved', remember);
  win.on('maximize', () => win?.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win?.webContents.send('window:maximized', false));

  // Open external links in the default browser rather than inside Stanton.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:') && !(isDev && url.startsWith(process.env.VITE_DEV_SERVER_URL!))) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  if (isDev) void win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'));
}

function registerIpc() {
  ipcMain.handle('data:load', async () => {
    try {
      return await fs.readFile(dataFile(), 'utf8');
    } catch {
      // Fall back to the backup if the main file is missing or unreadable.
      try {
        return await fs.readFile(`${dataFile()}.bak`, 'utf8');
      } catch {
        return null;
      }
    }
  });

  ipcMain.handle('data:save', async (_e, json: string) => {
    JSON.parse(json); // never persist something we can't read back
    await writeAtomic(dataFile(), json);
    return true;
  });

  ipcMain.handle('image:save', async (_e, bytes: Uint8Array, mime: string) => {
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' } as Record<string, string>)[mime] ?? 'png';
    await fs.mkdir(imagesDir(), { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(imagesDir(), name), Buffer.from(bytes));
    return `stanton://images/${name}`;
  });

  ipcMain.handle('window:dock', async (_e, edge: DockEdge | null) => {
    if (!win || !dock) return null;
    if (edge) {
      if (!dock.dockedEdge) {
        if (win.isMaximized()) win.unmaximize();
        floatingBounds = win.getBounds();
        settings.bounds = floatingBounds;
      }
      dock.dock(edge, settings.dockWidth ?? 380);
    } else {
      dock.undock(floatingBounds);
    }
    settings.dock = edge;
    await writeSettings(settings);
    sendDockState();
    return dockState();
  });
  ipcMain.handle('window:get-dock', () => dockState());
  ipcMain.handle('theme:set', async (_e, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme;
    settings.theme = theme;
    win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0a1e1e' : '#f3fafa');
    await writeSettings(settings);
  });
  registerAiIpc();
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    if (!win) return;
    if (dock?.dockedEdge) return; // maximising a docked bar makes no sense
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win?.close());
  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (/^https?:/.test(url)) return shell.openExternal(url);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.stanton.notes');
    protocol.handle('stanton', (req) => {
      const url = new URL(req.url);
      if (url.host !== 'images') return new Response('Not found', { status: 404 });
      const file = path.join(imagesDir(), path.basename(decodeURIComponent(url.pathname)));
      return net.fetch(pathToFileURL(file).toString());
    });
    log(`Stanton ${app.getVersion()} starting on ${process.platform} ${process.arch}`);
    registerIpc();
    createWindow();
  });

  app.on('before-quit', () => dock?.dispose());
  app.on('window-all-closed', () => app.quit());
}
