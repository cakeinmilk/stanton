import { beforeEach, describe, expect, it } from 'vitest';
import { mergeData, sameData, stampChanges } from '../src/lib/sync';
import { applyRemoteData, selectData, startPersistence, useStore } from '../src/store';
import { emptyData } from '../src/lib/seed';
import type { Entry, StantonData } from '../src/types';

const entry = (id: string, title: string, mtime: string): Entry => ({
  id,
  pageId: 'g1',
  kind: 'note',
  title,
  date: '2026-10-18',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: mtime,
  mtime,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] },
});
const data = (over: Partial<StantonData>): StantonData => ({ ...emptyData(), ...over });

describe('mergeData', () => {
  it('takes the newer copy of each item and keeps items only one side has', () => {
    const pc = data({ entries: [entry('a', 'PC edit', '2026-10-18T10:00:00Z'), entry('b', 'only PC', '2026-10-18T09:00:00Z')] });
    const phone = data({ entries: [entry('a', 'Phone edit', '2026-10-18T11:00:00Z'), entry('c', 'only phone', '2026-10-18T08:00:00Z')] });
    const m = mergeData(pc, phone);
    expect(Object.fromEntries(m.entries.map((e) => [e.id, e.title]))).toEqual({ a: 'Phone edit', b: 'only PC', c: 'only phone' });
  });

  it('syncs deletions, but an edit made after the deletion wins', () => {
    const pc = data({ entries: [entry('a', 'A', '2026-10-18T10:00:00Z'), entry('b', 'B', '2026-10-18T12:00:00Z')] });
    const phone = data({ entries: [], tombstones: [{ id: 'a', at: '2026-10-18T11:00:00Z' }, { id: 'b', at: '2026-10-18T11:00:00Z' }] });
    const m = mergeData(pc, phone);
    expect(m.entries.map((e) => e.id)).toEqual(['b']);
    expect(m.tombstones?.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('does not resurrect an item deleted on the other device', () => {
    const before = data({ entries: [entry('a', 'A', '2026-10-18T10:00:00Z')] });
    const after = data({ entries: [], tombstones: [{ id: 'a', at: '2026-10-18T10:05:00Z' }] });
    expect(mergeData(before, after).entries).toHaveLength(0);
    expect(mergeData(after, before).entries).toHaveLength(0);
  });

  it('uses the most recent ordering and preferences', () => {
    const p = (id: string, name: string) => ({ id, name, color: '#000', createdAt: '', mtime: '2026-10-01T00:00:00Z' });
    const a = data({ projects: [p('1', 'One'), p('2', 'Two')], layoutMtime: '2026-10-18T09:00:00Z', prefsMtime: '2026-10-18T12:00:00Z' });
    a.prefs = { ...a.prefs, scheme: 'royal' };
    const b = data({ projects: [p('2', 'Two'), p('1', 'One')], layoutMtime: '2026-10-18T10:00:00Z', prefsMtime: '2026-10-18T08:00:00Z' });
    const m = mergeData(a, b);
    expect(m.projects.map((x) => x.id)).toEqual(['2', '1']);
    expect(m.prefs.scheme).toBe('royal');
  });

  it('is stable: merging identical data changes nothing', () => {
    const a = data({ entries: [entry('a', 'A', '2026-10-18T10:00:00Z')] });
    expect(sameData(mergeData(a, JSON.parse(JSON.stringify(a))), a)).toBe(true);
  });
});

describe('stampChanges', () => {
  it('stamps edited/new items, tombstones removed ones, and flags reordering', () => {
    const e1 = entry('a', 'A', 'old');
    const e2 = entry('b', 'B', 'old');
    const prev = data({ entries: [e1, e2] });
    const next = data({ entries: [{ ...e1, title: 'A2' }], prefs: prev.prefs });
    const patch = stampChanges(prev, next, 'NOW')!;
    expect(patch.entries?.[0].mtime).toBe('NOW');
    expect(patch.tombstones).toEqual([{ id: 'b', at: 'NOW' }]);
  });
});

describe('store integration', () => {
  beforeEach(() => {
    useStore.setState({ ...emptyData(), loaded: true, externalRev: {} });
  });

  it('local edits get mtimes; remote changes merge in and refresh open editors', () => {
    (globalThis as any).window = { addEventListener() {} };
    startPersistence();
    const st = useStore.getState();
    const pid = st.addProject('Client A');
    const pg = useStore.getState().addPage(pid, 'Notes');
    const id = useStore.getState().addEntry(pg, 'note');
    const local = useStore.getState().entries.find((e) => e.id === id)!;
    expect(local.mtime).toBeTruthy();
    // The phone edits the same note later.
    const remote = selectData(useStore.getState());
    remote.entries = remote.entries.map((e) => (e.id === id ? { ...e, title: 'From phone', mtime: '2999-01-01T00:00:00Z', content: { type: 'doc', content: [] } } : e));
    applyRemoteData(remote);
    const s = useStore.getState();
    expect(s.entries.find((e) => e.id === id)?.title).toBe('From phone');
    expect(s.externalRev[id]).toBe(1);
    // A local delete leaves a tombstone.
    s.deleteEntry(id);
    expect(useStore.getState().tombstones?.some((t) => t.id === id)).toBe(true);
  });
});
