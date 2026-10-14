import type { JSONContent } from '@tiptap/core';
import type { EntryKind } from '../types';

/** Display names for the three kinds of entry. */
export const KIND_LABEL: Record<EntryKind, string> = { meeting: 'Meeting', note: 'Note', task: 'Tasks' };
export const KIND_ICON: Record<EntryKind, string> = { meeting: '👥', note: '📝', task: '☑' };
export const untitled = (kind: EntryKind) => (kind === 'meeting' ? 'Untitled meeting' : kind === 'task' ? 'Untitled tasks' : 'Untitled note');

/** Starting content for a new entry. */
export function blankContent(kind: EntryKind): JSONContent {
  if (kind === 'meeting') return { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] };
  if (kind === 'task') return { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }] };
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Turn bullet lists into checklists (used when converting an entry to Tasks). Stars are kept. */
export function bulletsToTasks(node: JSONContent): JSONContent {
  const kids = node.content?.map(bulletsToTasks);
  if (node.type === 'bulletList') return { ...node, type: 'taskList', content: kids };
  if (node.type === 'listItem') return { ...node, type: 'taskItem', attrs: { checked: false, ...(node.attrs ?? {}) }, content: kids };
  return kids ? { ...node, content: kids } : node;
}

/** Checked / total task items anywhere in a document. */
export function taskProgress(doc: JSONContent | undefined): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const walk = (n: JSONContent | undefined) => {
    if (!n) return;
    if (n.type === 'taskItem') {
      total++;
      if (n.attrs?.checked) done++;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return { done, total };
}
