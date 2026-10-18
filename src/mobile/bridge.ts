/**
 * The Android app's platform bridge: notes are kept on the phone (so it works offline) and
 * synced with stanton.json + images/ in a Google Drive folder – the same folder the PC uses
 * through Google Drive for desktop. Both sides merge with the rules in lib/sync.ts.
 */
import { App } from '@capacitor/app';
import type { StantonBridge, SyncStatus } from '../lib/platform';
import type { StantonData } from '../types';
import { mergeData, sameData } from '../lib/sync';
import * as drive from './drive';

const K = {
  data: 'stanton.m.data',
  folder: 'stanton.m.folder',
  signedIn: 'stanton.m.signedIn',
  account: 'stanton.m.account',
  lastVersion: 'stanton.m.lastVersion',
  lastPushed: 'stanton.m.lastPushedHash',
  lastSynced: 'stanton.m.lastSynced',
  pendingImages: 'stanton.m.pendingImages',
};
const DEFAULT_FOLDER = 'Stanton';
const IMAGE_CACHE = 'stanton-images';
const imageKey = (name: string) => `https://stanton-images.local/${encodeURIComponent(name)}`;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage full or unavailable */
    }
  },
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

// ---------- status ----------

let status: SyncStatus = {
  folder: ls.get(K.folder) ?? DEFAULT_FOLDER,
  suggestion: null,
  lastSyncedAt: ls.get(K.lastSynced),
  lastError: null,
  account: ls.get(K.account),
  state: ls.get(K.signedIn) ? 'idle' : 'signed-out',
};
const statusListeners = new Set<(s: SyncStatus) => void>();
const remoteListeners = new Set<(json: string) => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((f) => f(status));
}

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'offline';
  return m.replace(/^Error: /, '');
};

// ---------- images ----------

async function cachePut(name: string, blob: Blob) {
  const cache = await caches.open(IMAGE_CACHE);
  await cache.put(imageKey(name), new Response(blob, { headers: { 'content-type': blob.type || 'image/png' } }));
}

async function cacheGet(name: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const r = await cache.match(imageKey(name));
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

const pendingImages = (): string[] => JSON.parse(ls.get(K.pendingImages) ?? '[]');
const setPendingImages = (names: string[]) => ls.set(K.pendingImages, JSON.stringify([...new Set(names)]));

let folderIds: { root: string; images: string } | null = null;

async function folders(create = true) {
  if (folderIds) return folderIds;
  const root = await drive.folderByPath(status.folder ?? DEFAULT_FOLDER, create);
  if (!root) throw new Error(`Folder “${status.folder}” wasn't found in your Google Drive.`);
  folderIds = { root, images: await drive.subfolder(root, 'images') };
  return folderIds;
}

const blobUrls = new Map<string, Promise<string | null>>();

/** stanton://images/<name> → a blob: URL, from the phone's cache or downloaded from Drive. */
export function resolveImage(name: string): Promise<string | null> {
  if (!blobUrls.has(name)) {
    blobUrls.set(
      name,
      (async () => {
        let blob = await cacheGet(name);
        if (!blob && status.state !== 'signed-out') {
          try {
            const f = await drive.findFile((await folders(false)).images, name);
            if (f) {
              blob = await drive.downloadBlob(f.id);
              await cachePut(name, blob);
            }
          } catch {
            blobUrls.delete(name); // try again later
            return null;
          }
        }
        return blob ? URL.createObjectURL(blob) : null;
      })(),
    );
  }
  return blobUrls.get(name)!;
}

/** Swap stanton://images/… sources for local blob URLs wherever images appear. */
function watchImages() {
  const fix = (img: HTMLImageElement) => {
    const src = img.getAttribute('src') ?? '';
    const m = /^stanton:\/\/images\/(.+)$/.exec(src);
    if (!m) return;
    img.dataset.stantonSrc = src;
    void resolveImage(decodeURIComponent(m[1])).then((url) => {
      if (url && img.getAttribute('src') === src) img.setAttribute('src', url);
    });
  };
  const scan = (root: ParentNode) => root.querySelectorAll?.('img[src^="stanton://"]').forEach((i) => fix(i as HTMLImageElement));
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.target instanceof HTMLImageElement) fix(m.target);
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLImageElement) fix(n);
        else if (n instanceof Element) scan(n);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  scan(document);
}

// ---------- sync ----------

let local: string | null = ls.get(K.data);
let syncing: Promise<void> | null = null;
let again = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function uploadPendingImages() {
  const names = pendingImages();
  if (!names.length) return;
  const { images } = await folders();
  const left: string[] = [];
  for (const name of names) {
    try {
      const blob = await cacheGet(name);
      if (blob && !(await drive.findFile(images, name))) await drive.upload(images, name, blob);
    } catch {
      left.push(name);
    }
  }
  setPendingImages(left);
}

async function doSync() {
  if (!ls.get(K.signedIn)) {
    setStatus({ state: 'signed-out' });
    return;
  }
  setStatus({ state: 'syncing', lastError: null });
  try {
    const { root } = await folders();
    const file = await drive.findFile(root, 'stanton.json');
    let merged = local ? (JSON.parse(local) as StantonData) : null;

    // 1. Pull: something changed in Drive since we last looked (e.g. edits on the PC).
    if (file && file.version !== ls.get(K.lastVersion)) {
      const remoteText = await drive.downloadText(file.id);
      const remote = JSON.parse(remoteText) as StantonData;
      merged = merged ? mergeData(merged, remote) : remote;
      const mergedText = JSON.stringify(merged);
      if (!local || !sameData(JSON.parse(local), merged)) {
        local = mergedText;
        ls.set(K.data, mergedText);
        remoteListeners.forEach((f) => f(mergedText));
      }
      if (sameData(merged, remote)) {
        ls.set(K.lastVersion, file.version ?? null);
        ls.set(K.lastPushed, hash(mergedText));
      }
    }

    // 2. Push: our copy has changes Drive doesn't.
    if (merged) {
      const text = JSON.stringify(merged);
      if (!file || hash(text) !== ls.get(K.lastPushed)) {
        const saved = await drive.upload(root, 'stanton.json', new Blob([text], { type: 'application/json' }), file?.id);
        ls.set(K.lastVersion, saved.version ?? null);
        ls.set(K.lastPushed, hash(text));
      }
    }

    await uploadPendingImages();
    const now = new Date().toISOString();
    ls.set(K.lastSynced, now);
    setStatus({ state: 'idle', lastSyncedAt: now, lastError: null });
  } catch (e) {
    const msg = errText(e);
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'NEEDS_SIGN_IN') {
      ls.set(K.signedIn, null);
      setStatus({ state: 'signed-out', lastError: 'Please sign in to Google again.' });
    } else setStatus({ state: msg === 'offline' ? 'offline' : 'error', lastError: msg === 'offline' ? null : msg });
  }
}

/** Run a sync now (coalescing overlapping requests). */
export function syncNow(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = doSync().finally(() => {
    syncing = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return syncing;
}

export async function googleSignIn(folder?: string) {
  setStatus({ state: 'syncing', lastError: null });
  try {
    await drive.signIn(true);
    const account = await drive.whoAmI();
    ls.set(K.signedIn, '1');
    ls.set(K.account, account);
    if (folder) setFolder(folder);
    setStatus({ account });
    await syncNow();
  } catch (e) {
    setStatus({ state: 'signed-out', lastError: errText(e) === 'offline' ? 'No internet connection.' : errText(e) });
    throw e;
  }
}

export async function googleSignOut() {
  await drive.signOut();
  for (const k of [K.signedIn, K.account, K.lastVersion, K.lastPushed]) ls.set(k, null);
  folderIds = null;
  setStatus({ state: 'signed-out', account: null, lastError: null });
}

export function setFolder(folder: string) {
  const f = folder.trim().replace(/^My Drive\/?/i, '') || DEFAULT_FOLDER;
  ls.set(K.folder, f);
  ls.set(K.lastVersion, null);
  ls.set(K.lastPushed, null);
  folderIds = null;
  setStatus({ folder: f });
}

export const mobileStatus = () => status;
export function onMobileStatus(cb: (s: SyncStatus) => void) {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

function startBackgroundSync() {
  // Pull now, every minute while open, when coming back to the app and when the network returns.
  setTimeout(() => void syncNow(), 600);
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60000);
  void App.addListener('resume', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
  void App.addListener('pause', () => {
    clearTimeout(pushTimer);
    void syncNow();
  });
}

function blobToBytes(bytes: Uint8Array, mime: string) {
  return new Blob([bytes as BlobPart], { type: mime });
}

export function createMobileBridge(): StantonBridge {
  watchImages();
  startBackgroundSync();
  return {
    platform: 'android',
    async loadData() {
      return local;
    },
    async saveData(json) {
      local = json;
      ls.set(K.data, json);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void syncNow(), 2500);
      return true;
    },
    async saveImage(bytes, mime) {
      const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic' } as Record<string, string>)[mime] ?? 'png';
      const name = `${crypto.randomUUID()}.${ext}`;
      await cachePut(name, blobToBytes(bytes, mime));
      setPendingImages([...pendingImages(), name]);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void syncNow(), 1500);
      return `stanton://images/${name}`;
    },
    onRemoteData(cb) {
      remoteListeners.add(cb);
      return () => {
        remoteListeners.delete(cb);
      };
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
    minimize() {
      void App.minimizeApp();
    },
    toggleMaximize() {},
    close() {
      void App.exitApp();
    },
    async openExternal(url) {
      window.open(url, '_system');
    },
    async setTheme() {},
    async setMinimizeToTray() {},
    async saveFile() {
      return null;
    },
    async openFile() {
      return null;
    },
  };
}
