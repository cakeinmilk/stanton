import type { JSONContent } from '@tiptap/react';

export type ID = string;

export interface Project {
  id: ID;
  name: string;
  color: string;
  createdAt: string;
  archivedAt?: string | null;
}

export interface Page {
  id: ID;
  projectId: ID;
  title: string;
  createdAt: string;
  archivedAt?: string | null;
}

export type EntryKind = 'meeting' | 'note';

export interface Entry {
  id: ID;
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
}

export interface StantonData {
  version: 1;
  projects: Project[];
  pages: Page[];
  entries: Entry[];
  prefs: Prefs;
}

export type ColorScheme = 'teal' | 'royal' | 'graphite';

export interface Prefs {
  entrySort: 'newest' | 'oldest';
  theme: 'system' | 'light' | 'dark';
  scheme: ColorScheme;
  /** Gemini model id used for the weekly plan, e.g. "gemini-flash-latest". */
  aiModel: string;
  /** The user's weekly plan template (Markdown/plain text). */
  planTemplate: string;
  /** How many days back the meeting/note picker looks. */
  planDays: number;
  planIncludeDone: boolean;
  /** Include open action points in the plan request. */
  planIncludeActions: boolean;
  /** Free-form notes typed on the Weekly plan page (kept between sessions). */
  planNotes: string;
}

export type View =
  | { name: 'home' }
  | { name: 'project'; projectId: ID }
  | { name: 'page'; pageId: ID; focusEntryId?: ID; focusActionId?: ID }
  | { name: 'archive' }
  | { name: 'plan' }
  | { name: 'settings' };
