import type { JSONContent } from '@tiptap/react';

export type ID = string;

export interface ImportantDate {
  id: ID;
  /** yyyy-mm-dd */
  date: string;
  label: string;
}

export interface Tombstone {
  id: ID;
  /** When it was deleted (ISO). */
  at: string;
}

export interface Project {
  id: ID;
  /** Last change on any device (ISO), used when syncing. */
  mtime?: string;
  name: string;
  color: string;
  createdAt: string;
  archivedAt?: string | null;
  dates?: ImportantDate[];
}

export interface Page {
  id: ID;
  mtime?: string;
  projectId: ID;
  title: string;
  createdAt: string;
  archivedAt?: string | null;
}

export type EntryKind = 'meeting' | 'note' | 'task';

export interface Entry {
  id: ID;
  mtime?: string;
  pageId: ID;
  kind: EntryKind;
  title: string;
  /** ISO date (yyyy-mm-dd). For meetings this is the meeting date. */
  date: string;
  createdAt: string;
  updatedAt: string;
  content: JSONContent;
  collapsed?: boolean;
  /** When set, the entry is pinned to the top of its project (ordered by this time). */
  pinnedAt?: string | null;
  /** Emoji shown on the pinned chip. Defaults by kind. */
  pinIcon?: string | null;
  /** The whole meeting/note is an action point (as opposed to a starred bullet inside it). */
  action?: ActionStatus | null;
  actionDoneAt?: string | null;
}

export type ActionStatus = 'open' | 'done';

/** An action point is a starred bullet inside an entry. Derived, not stored separately. */
export interface ActionPoint {
  id: ID;
  entryId: ID;
  pageId: ID;
  projectId: ID;
  text: string;
  status: ActionStatus;
  completedAt?: string | null;
  entryTitle: string;
  entryKind: EntryKind;
  entryDate: string;
  /** True when the whole meeting/note is the action point. */
  whole?: boolean;
}

export interface StantonData {
  version: 1;
  projects: Project[];
  pages: Page[];
  entries: Entry[];
  prefs: Prefs;
  /** Sync bookkeeping: deletions, and when order / preferences last changed. */
  tombstones?: Tombstone[];
  layoutMtime?: string;
  prefsMtime?: string;
}

export type ColorScheme = 'teal' | 'royal' | 'graphite';

export interface Prefs {
  entrySort: 'newest' | 'oldest';
  theme: 'system' | 'light' | 'dark';
  scheme: ColorScheme;
  homeProjectsView: 'cards' | 'list';
  minimizeToTray: boolean;
  /** How finished to-dos look: crossed out and faded, or just ticked. */
  doneStyle: 'strike' | 'tick';
}

export type View =
  | { name: 'home' }
  | { name: 'project'; projectId: ID }
  | { name: 'page'; pageId: ID; focusEntryId?: ID; focusActionId?: ID }
  | { name: 'archive' }
  | { name: 'settings' };
