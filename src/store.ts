import { create } from 'zustand';
import type { JSONContent } from '@tiptap/react';
import type { ActionStatus, Entry, EntryKind, ID, Project, StantonData, View } from './types';
import { emptyData, normalize, seedData } from './lib/seed';
import { nowIso, PROJECT_COLORS, todayIso, uid } from './lib/util';
import { setActionStatusInContent } from './lib/actions';
import { bridge } from './lib/platform';

interface UiState {
  loaded: boolean;
  view: View;
  history: View[];
  /** Bumped when an entry's content is changed outside its editor, so the editor reloads. */
  externalRev: Record<ID, number>;
  saveState: 'saved' | 'saving' | 'error';
}

interface Actions {
  load(): Promise<void>;
  navigate(view: View): void;
  back(): void;

  addProject(name: string): ID;
  updateProject(id: ID, patch: Partial<Pick<Project, 'name' | 'color'>>): void;
  archiveProject(id: ID): void;
  restoreProject(id: ID): void;
  deleteProject(id: ID): void;

  addPage(projectId: ID, title: string): ID;
  renamePage(id: ID, title: string): void;
  movePage(id: ID, projectId: ID): void;
  /** Reorder: put project `id` just before `beforeId` (or at the end when null). */
  moveProjectBefore(id: ID, beforeId: ID | null): void;
  /** Move page `id` into `projectId`, just before page `beforeId` (or at the end of that project when null). */
  movePageTo(id: ID, projectId: ID, beforeId: ID | null): void;
  archivePage(id: ID): void;
  restorePage(id: ID): void;
  deletePage(id: ID): void;

  addEntry(pageId: ID, kind: EntryKind): ID;
  updateEntry(id: ID, patch: Partial<Pick<Entry, 'title' | 'date' | 'kind' | 'collapsed'>>): void;
  setEntryContent(id: ID, content: JSONContent): void;
  deleteEntry(id: ID): void;
  /** Pin/unpin an entry to its project, or change its pin icon. Doesn't count as an edit. */
  setEntryPin(id: ID, patch: { pinned?: boolean; icon?: string | null }): void;

  setActionStatus(entryId: ID, actionId: ID, status: ActionStatus): void;
  setEntrySort(sort: StantonData['prefs']['entrySort']): void;
  setPrefs(patch: Partial<StantonData['prefs']>): void;
}

export type Store = StantonData & UiState & Actions;

export const useStore = create<Store>()((set, get) => {
  const touchEntry = (id: ID, patch: Partial<Entry>) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: nowIso() } : e)) }));

  /** If the current view points at something that no longer exists/is archived, go home. */
  const fixView = () => {
    const s = get();
    const v = s.view;
    const liveProject = (id: ID) => s.projects.some((p) => p.id === id && !p.archivedAt);
    if (v.name === 'project' && !liveProject(v.projectId)) set({ view: { name: 'home' } });
    if (v.name === 'page') {
      const page = s.pages.find((p) => p.id === v.pageId);
      if (!page || page.archivedAt || !liveProject(page.projectId)) set({ view: { name: 'home' } });
    }
    set((st) => ({ history: st.history.filter((h) => (h.name === 'project' ? liveProject(h.projectId) : h.name === 'page' ? st.pages.some((p) => p.id === h.pageId && !p.archivedAt) : true)) }));
  };

  return {
    ...emptyData(),
    loaded: false,
    view: { name: 'home' },
    history: [],
    externalRev: {},
    saveState: 'saved',

    async load() {
      let data: StantonData;
      try {
        const raw = await bridge.loadData();
        data = raw ? normalize(JSON.parse(raw)) : seedData();
      } catch (err) {
        console.error('Failed to load data', err);
        data = seedData();
      }
      set({ ...data, loaded: true });
    },

    navigate(view) {
      const cur = get().view;
      if (JSON.stringify(cur) === JSON.stringify(view)) return;
      set((s) => ({ view, history: [...s.history.slice(-49), cur] }));
    },
    back() {
      const h = get().history;
      if (!h.length) return;
      set({ view: h[h.length - 1], history: h.slice(0, -1) });
    },

    addProject(name) {
      const id = uid();
      const color = PROJECT_COLORS[get().projects.length % PROJECT_COLORS.length];
      set((s) => ({ projects: [...s.projects, { id, name: name.trim() || 'Untitled project', color, createdAt: nowIso() }] }));
      return id;
    },
    updateProject(id, patch) {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },
    archiveProject(id) {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, archivedAt: nowIso() } : p)) }));
      fixView();
    },
    restoreProject(id) {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)) }));
    },
    deleteProject(id) {
      set((s) => {
        const pageIds = new Set(s.pages.filter((p) => p.projectId === id).map((p) => p.id));
        return {
          projects: s.projects.filter((p) => p.id !== id),
          pages: s.pages.filter((p) => !pageIds.has(p.id)),
          entries: s.entries.filter((e) => !pageIds.has(e.pageId)),
        };
      });
      fixView();
    },

    addPage(projectId, title) {
      const id = uid();
      set((s) => ({ pages: [...s.pages, { id, projectId, title: title.trim() || 'Untitled page', createdAt: nowIso() }] }));
      return id;
    },
    renamePage(id, title) {
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, title } : p)) }));
    },
    movePage(id, projectId) {
      get().movePageTo(id, projectId, null);
    },
    moveProjectBefore(id, beforeId) {
      if (id === beforeId) return;
      set((s) => {
        const moving = s.projects.find((p) => p.id === id);
        if (!moving) return {};
        const rest = s.projects.filter((p) => p.id !== id);
        const at = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
        rest.splice(at < 0 ? rest.length : at, 0, moving);
        return { projects: rest };
      });
    },
    movePageTo(id, projectId, beforeId) {
      if (id === beforeId) return;
      set((s) => {
        const moving = s.pages.find((p) => p.id === id);
        if (!moving) return {};
        const rest = s.pages.filter((p) => p.id !== id);
        let at = beforeId ? rest.findIndex((p) => p.id === beforeId) : -1;
        if (at < 0) {
          // After the last page of the target project, or at the very end.
          const last = rest.map((p) => p.projectId).lastIndexOf(projectId);
          at = last < 0 ? rest.length : last + 1;
        }
        rest.splice(at, 0, { ...moving, projectId });
        return { pages: rest };
      });
    },
    archivePage(id) {
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, archivedAt: nowIso() } : p)) }));
      fixView();
    },
    restorePage(id) {
      set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)) }));
    },
    deletePage(id) {
      set((s) => ({ pages: s.pages.filter((p) => p.id !== id), entries: s.entries.filter((e) => e.pageId !== id) }));
      fixView();
    },

    addEntry(pageId, kind) {
      const id = uid();
      const now = nowIso();
      const entry: Entry = {
        id,
        pageId,
        kind,
        title: '',
        date: todayIso(),
        createdAt: now,
        updatedAt: now,
        content:
          kind === 'meeting'
            ? { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] }
            : { type: 'doc', content: [{ type: 'paragraph' }] },
      };
      set((s) => ({ entries: [...s.entries, entry] }));
      return id;
    },
    updateEntry(id, patch) {
      touchEntry(id, patch);
    },
    setEntryContent(id, content) {
      touchEntry(id, { content });
    },
    deleteEntry(id) {
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    },
    setEntryPin(id, { pinned, icon }) {
      set((s) => ({
        entries: s.entries.map((e) => {
          if (e.id !== id) return e;
          const next = { ...e };
          if (pinned !== undefined) next.pinnedAt = pinned ? e.pinnedAt ?? nowIso() : null;
          if (icon !== undefined) next.pinIcon = icon;
          return next;
        }),
      }));
    },

    setActionStatus(entryId, actionId, status) {
      const entry = get().entries.find((e) => e.id === entryId);
      if (!entry) return;
      const { content, changed } = setActionStatusInContent(entry.content, actionId, status, nowIso());
      if (!changed) return;
      touchEntry(entryId, { content });
      set((s) => ({ externalRev: { ...s.externalRev, [entryId]: (s.externalRev[entryId] ?? 0) + 1 } }));
    },
    setEntrySort(entrySort) {
      set((s) => ({ prefs: { ...s.prefs, entrySort } }));
    },
    setPrefs(patch) {
      set((s) => ({ prefs: { ...s.prefs, ...patch } }));
    },
  };
});

export function selectData(s: Store): StantonData {
  return { version: 1, projects: s.projects, pages: s.pages, entries: s.entries, prefs: s.prefs };
}

/** Debounced persistence of the data portion of the store. */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending = false;

async function flush() {
  if (!pending) return;
  pending = false;
  clearTimeout(saveTimer);
  useStore.setState({ saveState: 'saving' });
  try {
    await bridge.saveData(JSON.stringify(selectData(useStore.getState())));
    if (!pending) useStore.setState({ saveState: 'saved' });
  } catch (err) {
    console.error('Save failed', err);
    useStore.setState({ saveState: 'error' });
    pending = true;
    saveTimer = setTimeout(flush, 3000);
  }
}

export function startPersistence() {
  useStore.subscribe((s, prev) => {
    if (!s.loaded) return;
    if (s.projects === prev.projects && s.pages === prev.pages && s.entries === prev.entries && s.prefs === prev.prefs && prev.loaded) return;
    pending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  });
  window.addEventListener('beforeunload', () => void flush());
}
