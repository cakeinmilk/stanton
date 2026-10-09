import { confirmDialog, iconDialog, promptDialog } from '../components/Dialogs';
import { PIN_ICONS, pinIcon } from './pins';
import type { MenuEntry } from '../components/Menu';
import { useStore } from '../store';
import type { ID } from '../types';

const st = () => useStore.getState();

export async function newProject() {
  const name = await promptDialog('New project', '', { label: 'Project name', okLabel: 'Create' });
  if (!name) return;
  const id = st().addProject(name);
  st().navigate({ name: 'project', projectId: id });
}

export async function newPage(projectId: ID) {
  const title = await promptDialog('New page', '', { label: 'Page title', okLabel: 'Create' });
  if (!title) return;
  const id = st().addPage(projectId, title);
  st().navigate({ name: 'page', pageId: id });
}

export async function renameProject(id: ID) {
  const p = st().projects.find((x) => x.id === id);
  if (!p) return;
  const name = await promptDialog('Rename project', p.name, { okLabel: 'Rename' });
  if (name) st().updateProject(id, { name });
}

export async function renamePage(id: ID) {
  const p = st().pages.find((x) => x.id === id);
  if (!p) return;
  const title = await promptDialog('Rename page', p.title, { okLabel: 'Rename' });
  if (title) st().renamePage(id, title);
}

export async function deleteProject(id: ID) {
  const p = st().projects.find((x) => x.id === id);
  if (!p) return;
  const pageCount = st().pages.filter((x) => x.projectId === id).length;
  const ok = await confirmDialog(
    'Delete project?',
    `"${p.name}" and its ${pageCount} page${pageCount === 1 ? '' : 's'} will be permanently deleted. Archive it instead if you might need it later.`,
    { okLabel: 'Delete permanently', danger: true },
  );
  if (ok) st().deleteProject(id);
}

export async function deletePage(id: ID) {
  const p = st().pages.find((x) => x.id === id);
  if (!p) return;
  const ok = await confirmDialog('Delete page?', `"${p.title}" and all its meetings and notes will be permanently deleted.`, {
    okLabel: 'Delete permanently',
    danger: true,
  });
  if (ok) st().deletePage(id);
}

export async function deleteEntry(id: ID) {
  const e = st().entries.find((x) => x.id === id);
  if (!e) return;
  const ok = await confirmDialog(`Delete ${e.kind}?`, `"${e.title || 'Untitled'}" will be permanently deleted, including its action points.`, {
    okLabel: 'Delete',
    danger: true,
  });
  if (ok) st().deleteEntry(id);
}

/** Move a page, asking first when it changes project (its action points move with it). */
export async function movePageWithWarning(pageId: ID, projectId: ID, beforeId: ID | null) {
  const page = st().pages.find((p) => p.id === pageId);
  if (!page) return;
  if (page.projectId !== projectId) {
    const from = st().projects.find((p) => p.id === page.projectId)?.name ?? 'its project';
    const to = st().projects.find((p) => p.id === projectId)?.name ?? 'another project';
    const count = st().entries.filter((e) => e.pageId === pageId).length;
    const ok = await confirmDialog(
      'Move page to another project?',
      count
        ? `"${page.title}" and its ${count} meeting${count === 1 ? '' : 's'}/note${count === 1 ? '' : 's'} will move from ${from} to ${to}. Its action points and pins will belong to ${to} instead.`
        : `"${page.title}" will move from ${from} to ${to}.`,
      { okLabel: `Move to ${to}` },
    );
    if (!ok) return;
  }
  st().movePageTo(pageId, projectId, beforeId);
}

function neighbours<T extends { id: ID }>(list: T[], id: ID) {
  const i = list.findIndex((x) => x.id === id);
  return { prev: list[i - 1], next: list[i + 1], afterNext: list[i + 2] };
}

export function projectMenu(id: ID): MenuEntry[] {
  const live = st().projects.filter((p) => !p.archivedAt);
  const { prev, next, afterNext } = neighbours(live, id);
  return [
    { label: 'New page', icon: '＋', onSelect: () => void newPage(id) },
    { label: 'Rename', icon: '✎', onSelect: () => void renameProject(id) },
    { label: 'Move up', icon: '↑', disabled: !prev, onSelect: () => prev && st().moveProjectBefore(id, prev.id) },
    { label: 'Move down', icon: '↓', disabled: !next, onSelect: () => next && st().moveProjectBefore(id, afterNext?.id ?? null) },
    'separator',
    { label: 'Archive', icon: '🗄', onSelect: () => st().archiveProject(id) },
    { label: 'Delete…', icon: '🗑', danger: true, onSelect: () => void deleteProject(id) },
  ];
}

export function pageMenu(id: ID): MenuEntry[] {
  const page = st().pages.find((p) => p.id === id);
  const others = st().projects.filter((p) => !p.archivedAt && p.id !== page?.projectId);
  const siblings = st().pages.filter((p) => p.projectId === page?.projectId && !p.archivedAt);
  const { prev, next, afterNext } = neighbours(siblings, id);
  return [
    { label: 'Rename', icon: '✎', onSelect: () => void renamePage(id) },
    { label: 'Move up', icon: '↑', disabled: !prev, onSelect: () => page && prev && st().movePageTo(id, page.projectId, prev.id) },
    { label: 'Move down', icon: '↓', disabled: !next, onSelect: () => page && next && st().movePageTo(id, page.projectId, afterNext?.id ?? null) },
    ...others.map((p): MenuEntry => ({ label: `Move to ${p.name}`, icon: '→', onSelect: () => void movePageWithWarning(id, p.id, null) })),
    'separator',
    { label: 'Archive', icon: '🗄', onSelect: () => st().archivePage(id) },
    { label: 'Delete…', icon: '🗑', danger: true, onSelect: () => void deletePage(id) },
  ];
}

export async function changePinIcon(entryId: ID) {
  const e = st().entries.find((x) => x.id === entryId);
  if (!e) return;
  const icon = await iconDialog('Choose an icon', pinIcon(e), PIN_ICONS);
  if (icon) st().setEntryPin(entryId, { icon });
}

export function pinMenu(entryId: ID): MenuEntry[] {
  const e = st().entries.find((x) => x.id === entryId);
  if (!e) return [];
  return e.pinnedAt
    ? [
        { label: 'Change icon…', icon: pinIcon(e), onSelect: () => void changePinIcon(entryId) },
        { label: 'Unpin from project', icon: '📌', onSelect: () => st().setEntryPin(entryId, { pinned: false }) },
      ]
    : [{ label: 'Pin to top of project', icon: '📌', onSelect: () => st().setEntryPin(entryId, { pinned: true }) }];
}
