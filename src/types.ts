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
  prefs: {
    entrySort: 'newest' | 'oldest';
  };
}

export type View =
  | { name: 'home' }
  | { name: 'project'; projectId: ID }
  | { name: 'page'; pageId: ID; focusEntryId?: ID; focusActionId?: ID }
  | { name: 'archive' };
