/**
 * Merging two copies of Stanton's data (e.g. the PC's and the phone's, via Google Drive).
 *
 * Every project, page and entry carries `mtime` – when it was last changed on any device.
 * Deleting something leaves a tombstone so the deletion syncs too. When two copies meet:
 *   - each item comes from whichever copy changed it most recently;
 *   - an item is dropped if it was deleted after its last change;
 *   - the order of projects/pages comes from whichever copy was reordered last;
 *   - preferences come from whichever copy changed them last.
 *
 * Pure functions only: this file is shared by the desktop main process, the renderer and
 * the Android app.
 */
import type { StantonData, Tombstone } from '../types';

type Item = { id: string; mtime?: string; updatedAt?: string; createdAt?: string };

/** How long deletions are remembered (long enough for a device that's been off for a while). */
const TOMBSTONE_DAYS = 180;

export const mtimeOf = (x: Item) => x.mtime || x.updatedAt || x.createdAt || '';

function mergeTombstones(a: Tombstone[] = [], b: Tombstone[] = [], now = new Date()): Tombstone[] {
  const cutoff = new Date(now.getTime() - TOMBSTONE_DAYS * 86400000).toISOString();
  const map = new Map<string, string>();
  for (const t of [...a, ...b]) {
    if (t.at < cutoff) continue;
    const cur = map.get(t.id);
    if (!cur || t.at > cur) map.set(t.id, t.at);
  }
  return [...map].map(([id, at]) => ({ id, at }));
}

function mergeList<T extends Item>(local: T[], remote: T[], tombs: Map<string, string>, remoteOrderWins: boolean): T[] {
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const pick = (id: string): T | undefined => {
    const a = l.get(id);
    const b = r.get(id);
    const winner = !a ? b : !b ? a : mtimeOf(b) > mtimeOf(a) ? b : a;
    if (!winner) return undefined;
    const deletedAt = tombs.get(id);
    return deletedAt && deletedAt >= mtimeOf(winner) ? undefined : winner;
  };
  const [first, second] = remoteOrderWins ? [remote, local] : [local, remote];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of [...first, ...second]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const w = pick(x.id);
    if (w) out.push(w);
  }
  return out;
}

/** Merge `remote` into `local`. With identical inputs the result equals `local`. */
export function mergeData(local: StantonData, remote: StantonData, now = new Date()): StantonData {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);
  const tombs = new Map(tombstones.map((t) => [t.id, t.at]));
  const remoteLayout = (remote.layoutMtime ?? '') > (local.layoutMtime ?? '');
  const remotePrefs = (remote.prefsMtime ?? '') > (local.prefsMtime ?? '');
  return {
    ...local,
    version: 1,
    projects: mergeList(local.projects, remote.projects, tombs, remoteLayout),
    pages: mergeList(local.pages, remote.pages, tombs, remoteLayout),
    entries: mergeList(local.entries, remote.entries, tombs, false),
    prefs: remotePrefs ? { ...local.prefs, ...remote.prefs } : local.prefs,
    tombstones,
    layoutMtime: remoteLayout ? remote.layoutMtime : local.layoutMtime,
    prefsMtime: remotePrefs ? remote.prefsMtime : local.prefsMtime,
  };
}

/** Cheap structural comparison used to decide whether a merge changed anything. */
export function sameData(a: StantonData, b: StantonData): boolean {
  return JSON.stringify(dataOnly(a)) === JSON.stringify(dataOnly(b));
}

export function dataOnly(d: StantonData): StantonData {
  return {
    version: 1,
    projects: d.projects,
    pages: d.pages,
    entries: d.entries,
    prefs: d.prefs,
    tombstones: d.tombstones ?? [],
    layoutMtime: d.layoutMtime,
    prefsMtime: d.prefsMtime,
  };
}

/**
 * Work out what changed between two versions of local state and stamp it:
 * changed/new items get `mtime = now`, removed items get a tombstone, reordering bumps
 * `layoutMtime`, preference changes bump `prefsMtime`. Returns null if nothing needs stamping.
 */
export function stampChanges(prev: StantonData, next: StantonData, now: string): Partial<StantonData> | null {
  let dirty = false;
  const tombstones = [...(next.tombstones ?? [])];
  const stampList = <T extends Item>(before: T[], after: T[]): T[] => {
    if (before === after) return after;
    const old = new Map(before.map((x) => [x.id, x]));
    let changed = false;
    const out = after.map((x) => {
      if (old.get(x.id) === x) return x;
      changed = true;
      return { ...x, mtime: now };
    });
    const ids = new Set(after.map((x) => x.id));
    for (const x of before) {
      if (!ids.has(x.id)) {
        tombstones.push({ id: x.id, at: now });
        changed = true;
      }
    }
    if (changed) dirty = true;
    return changed ? out : after;
  };
  const order = (xs: Item[]) => xs.map((x) => x.id).join(',');
  const projects = stampList(prev.projects, next.projects);
  const pages = stampList(prev.pages, next.pages);
  const entries = stampList(prev.entries, next.entries);
  const patch: Partial<StantonData> = { projects, pages, entries, tombstones };
  if (order(prev.projects) !== order(next.projects) || order(prev.pages) !== order(next.pages)) {
    patch.layoutMtime = now;
    dirty = true;
  }
  if (prev.prefs !== next.prefs) {
    patch.prefsMtime = now;
    dirty = true;
  }
  return dirty ? patch : null;
}
