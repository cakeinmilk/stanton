import type { JSONContent } from '@tiptap/react';
import type { ActionPoint, ActionStatus, Entry, Page, Project } from '../types';

/** Attribute names used on listItem / taskItem nodes. */
export const ACTION_ATTR = 'action';
export const ACTION_ID_ATTR = 'actionId';
export const ACTION_DONE_AT_ATTR = 'actionDoneAt';

const LIST_ITEM_TYPES = new Set(['listItem', 'taskItem']);

export function nodeText(node: JSONContent, nestedLists = false): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  if (!node.content) return '';
  const parts: string[] = [];
  for (const child of node.content) {
    // Don't include the text of nested sub-bullets in the action point's own text.
    if (!nestedLists && (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList')) continue;
    parts.push(nodeText(child, nestedLists));
  }
  return parts.join(node.type === 'listItem' || node.type === 'doc' ? ' ' : '').replace(/\s+/g, ' ').trim();
}

/** Walk a TipTap document and return all starred list items. */
export function extractActions(content: JSONContent | undefined): { id: string; text: string; status: ActionStatus; completedAt: string | null }[] {
  const out: { id: string; text: string; status: ActionStatus; completedAt: string | null }[] = [];
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.type && LIST_ITEM_TYPES.has(node.type)) {
      const status = node.attrs?.[ACTION_ATTR] as ActionStatus | null | undefined;
      const id = node.attrs?.[ACTION_ID_ATTR] as string | null | undefined;
      if ((status === 'open' || status === 'done') && id) {
        out.push({ id, text: nodeText(node) || '(empty action)', status, completedAt: node.attrs?.[ACTION_DONE_AT_ATTR] ?? null });
      }
    }
    node.content?.forEach(walk);
  };
  walk(content);
  return out;
}

/** Return a copy of `content` with the given action's status changed. */
export function setActionStatusInContent(content: JSONContent, actionId: string, status: ActionStatus, when: string): { content: JSONContent; changed: boolean } {
  let changed = false;
  const walk = (node: JSONContent): JSONContent => {
    let next = node;
    if (node.type && LIST_ITEM_TYPES.has(node.type) && node.attrs?.[ACTION_ID_ATTR] === actionId && node.attrs?.[ACTION_ATTR] !== status) {
      changed = true;
      next = { ...node, attrs: { ...node.attrs, [ACTION_ATTR]: status, [ACTION_DONE_AT_ATTR]: status === 'done' ? when : null } };
    }
    if (next.content) {
      const kids = next.content.map(walk);
      if (kids.some((k, i) => k !== next.content![i])) next = { ...next, content: kids };
    }
    return next;
  };
  const result = walk(content);
  return { content: result, changed };
}

/** Action ids for whole-entry actions are prefixed so they never clash with bullet ids. */
export const WHOLE_PREFIX = 'note:';
export const wholeActionId = (entryId: string) => `${WHOLE_PREFIX}${entryId}`;

export function collectActionPoints(entries: Entry[], pages: Page[], projects: Project[], opts: { includeArchived?: boolean } = {}): ActionPoint[] {
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const result: ActionPoint[] = [];
  for (const entry of entries) {
    const page = pageById.get(entry.pageId);
    if (!page) continue;
    const project = projectById.get(page.projectId);
    if (!project) continue;
    if (!opts.includeArchived && (page.archivedAt || project.archivedAt)) continue;
    if (entry.action === 'open' || entry.action === 'done') {
      result.push({
        id: wholeActionId(entry.id),
        entryId: entry.id,
        pageId: page.id,
        projectId: project.id,
        text: entry.title.trim() || (entry.kind === 'meeting' ? 'Untitled meeting' : 'Untitled note'),
        status: entry.action,
        completedAt: entry.actionDoneAt ?? null,
        entryTitle: entry.title,
        entryKind: entry.kind,
        entryDate: entry.date,
        whole: true,
      });
    }
    for (const a of extractActions(entry.content)) {
      result.push({
        id: a.id,
        entryId: entry.id,
        pageId: page.id,
        projectId: project.id,
        text: a.text,
        status: a.status,
        completedAt: a.completedAt,
        entryTitle: entry.title,
        entryKind: entry.kind,
        entryDate: entry.date,
      });
    }
  }
  // Oldest meeting first so long-standing actions float to the top.
  return result.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
}
