/**
 * Where Stanton keeps its notes, and syncing through a cloud-drive folder.
 *
 * By default data lives in %APPDATA%\Stanton\data. With a sync folder set (e.g.
 * G:\My Drive\Stanton from Google Drive for desktop), stanton.json and images\ live there
 * instead. Google Drive moves the files between devices; Stanton watches the folder and
 * merges changes made elsewhere (e.g. on the phone) using the same rules as the Android app.
 * No sign-in is needed on the PC – Drive for desktop is already signed in.
 */
import { app } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mergeData, sameData } from '../src/lib/sync';
import type { StantonData } from '../src/types';
import { log } from './log';

export interface SyncStatus {
  folder: string | null;
  /** A likely Google Drive folder to suggest, e.g. "G:\\My Drive\\Stanton". */
  suggestion: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const FILE = 'stanton.json';
const hash = (s: string) => createHash('sha1').update(s).digest('hex');

/** Google Drive for desktop shows up as a drive letter with a "My Drive" folder. */
function findGoogleDrive(): string | null {
  if (process.platform !== 'win32') return null;
  for (const letter of 'GHIJKLMNOPQRSTUVWXYZDEF') {
    for (const name of ['My Drive', 'Mon Drive', 'Meine Ablage', 'Mi unidad', 'Il mio Drive', 'Mijn Drive', 'Minha unidade']) {
      const p = `${letter}:\\${name}`;
      if (existsSync(p)) return path.join(p, 'Stanton');
    }
  }
  return null;
}

async function copyDir(from: string, to: string) {
  if (!existsSync(from)) return;
  await fs.mkdir(to, { recursive: true });
  for (const name of await fs.readdir(from)) {
    const dest = path.join(to, name);
    if (!existsSync(dest)) await fs.copyFile(path.join(from, name), dest).catch((e) => log('Copy failed', name, e.message));
  }
}

export class DataStore {
  private lastHash: string | null = null;
  private watcher: FSWatcher | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private status: SyncStatus = { folder: null, suggestion: null, lastSyncedAt: null, lastError: null };

  constructor(
    private getFolder: () => string | null,
    private setFolder: (f: string | null) => Promise<void>,
    /** Called with merged-in changes that arrived through the sync folder. */
    private onRemote: (json: string) => void,
    private onStatus: (s: SyncStatus) => void,
  ) {}

  private localDir = () => path.join(app.getPath('userData'), 'data');
  dir = () => this.getFolder() ?? this.localDir();
  file = () => path.join(this.dir(), FILE);
  imagesDir = () => path.join(this.dir(), 'images');
  /** Fallback for images not yet synced down / copied. */
  localImagesDir = () => path.join(this.localDir(), 'images');
  syncing = () => !!this.getFolder();

  getStatus(): SyncStatus {
    return { ...this.status, folder: this.getFolder(), suggestion: findGoogleDrive() };
  }

  private emit(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.getStatus());
  }

  private async read(file = this.file()): Promise<string | null> {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return null;
    }
  }

  /** Merge Drive's "stanton (1).json"-style conflict copies into the main file, then remove them. */
  private async absorbConflictCopies(json: string): Promise<string> {
    if (!this.syncing()) return json;
    let data = JSON.parse(json) as StantonData;
    let changed = false;
    for (const name of await fs.readdir(this.dir()).catch(() => [] as string[])) {
      if (!/^stanton \(\d+\)\.json$/i.test(name)) continue;
      try {
        const other = JSON.parse(await fs.readFile(path.join(this.dir(), name), 'utf8')) as StantonData;
        data = mergeData(data, other);
        changed = true;
        await fs.rm(path.join(this.dir(), name));
        log('Merged and removed conflict copy', name);
      } catch (e: any) {
        log('Could not merge conflict copy', name, e.message);
      }
    }
    return changed ? JSON.stringify(data) : json;
  }

  async load(): Promise<string | null> {
    let json = await this.read();
    if (json == null && !this.syncing()) json = await this.read(`${this.file()}.bak`);
    if (json == null) return null;
    try {
      json = await this.absorbConflictCopies(json);
    } catch {
      /* unreadable main file – return as is, the renderer falls back */
    }
    this.lastHash = hash(json);
    if (this.syncing()) this.emit({ lastSyncedAt: new Date().toISOString(), lastError: null });
    return json;
  }

  /**
   * Save the renderer's data. In a sync folder, first merge with whatever is on disk if it
   * changed since we last looked (e.g. Drive just brought in the phone's edits). Returns the
   * merged JSON when it differs from what the renderer sent, so the renderer can update.
   */
  async save(json: string): Promise<string | null> {
    const incoming = JSON.parse(json) as StantonData; // never persist something unreadable
    if (!this.syncing()) {
      await writeAtomic(this.file(), json);
      this.lastHash = hash(json);
      return null;
    }
    let out = json;
    let result: string | null = null;
    const disk = await this.read();
    if (disk && hash(disk) !== this.lastHash) {
      try {
        const merged = mergeData(incoming, JSON.parse(disk) as StantonData);
        if (!sameData(merged, incoming)) {
          out = JSON.stringify(merged);
          result = out;
        }
      } catch {
        log('Sync file was unreadable while saving; overwriting with this PC’s copy');
      }
    }
    try {
      await fs.mkdir(this.dir(), { recursive: true });
      // Write in place (no rename) so Google Drive keeps the same file and its version history.
      await fs.writeFile(this.file(), out, 'utf8');
      // A local safety copy, outside the cloud folder.
      await writeAtomic(path.join(this.localDir(), 'sync-backup.json'), out);
      this.lastHash = hash(out);
      this.emit({ lastSyncedAt: new Date().toISOString(), lastError: null });
    } catch (e: any) {
      this.emit({ lastError: `Couldn't write to the sync folder: ${e.message}` });
      throw e;
    }
    return result;
  }

  /** Pick up changes Drive brings in from other devices. */
  private async check() {
    const disk = await this.read();
    if (disk == null || hash(disk) === this.lastHash) return;
    try {
      JSON.parse(disk); // Drive may still be writing it; try again next time.
    } catch {
      return;
    }
    this.lastHash = hash(disk);
    log('Sync folder changed on another device – merging');
    this.onRemote(disk);
    this.emit({ lastSyncedAt: new Date().toISOString(), lastError: null });
  }

  startWatching() {
    this.stopWatching();
    if (!this.syncing()) return;
    const kick = () => {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.check().catch((e) => log('Sync check failed', e.message)), 800);
    };
    try {
      this.watcher = watch(this.dir(), (_ev, name) => {
        if (!name || String(name).toLowerCase().startsWith('stanton')) kick();
      });
      this.watcher.on('error', (e) => log('Sync folder watch error', e.message));
    } catch (e: any) {
      log('Sync folder watch unavailable, polling only', e.message);
    }
    // Virtual drives don't always report changes, so poll as well.
    this.poll = setInterval(kick, 10000);
  }

  stopWatching() {
    this.watcher?.close();
    this.watcher = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /**
   * Start syncing through `folder`. Whatever is already there is merged with this PC's
   * notes (nothing is lost on either side). Returns the merged data for the renderer.
   */
  async enable(folder: string, currentJson: string): Promise<string> {
    await fs.mkdir(folder, { recursive: true });
    const existing = await this.read(path.join(folder, FILE));
    let out = currentJson;
    if (existing) {
      try {
        out = JSON.stringify(mergeData(JSON.parse(currentJson), JSON.parse(existing)));
      } catch {
        throw new Error('That folder has a stanton.json Stanton can’t read. Choose another folder or remove that file.');
      }
    }
    await copyDir(this.imagesDir(), path.join(folder, 'images'));
    await fs.writeFile(path.join(folder, FILE), out, 'utf8');
    await this.setFolder(folder);
    this.lastHash = hash(out);
    this.startWatching();
    this.emit({ lastSyncedAt: new Date().toISOString(), lastError: null });
    log('Sync folder enabled', folder);
    return out;
  }

  /** Stop syncing: keep a copy of everything on this PC again. */
  async disable(currentJson: string) {
    const from = this.dir();
    this.stopWatching();
    await copyDir(path.join(from, 'images'), this.localImagesDir());
    await writeAtomic(path.join(this.localDir(), FILE), currentJson);
    await this.setFolder(null);
    this.lastHash = hash(currentJson);
    this.emit({ lastSyncedAt: null, lastError: null });
    log('Sync folder disabled; data copied back to', this.localDir());
  }
}

/** Atomic write: write a temp file then rename over the original (keeps a .bak). */
export async function writeAtomic(file: string, contents: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  if (existsSync(file)) await fs.copyFile(file, `${file}.bak`).catch(() => undefined);
  await fs.rename(tmp, file);
}
