import { confirmDialog, promptDialog } from '../components/Dialogs';
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

export function projectMenu(id: ID): MenuEntry[] {
  return [
    { label: 'New page', icon: '＋', onSelect: () => void newPage(id) },
    { label: 'Rename', icon: '✎', onSelect: () => void renameProject(id) },
    'separator',
    { label: 'Archive', icon: '🗄', onSelect: () => st().archiveProject(id) },
    { label: 'Delete…', icon: '🗑', danger: true, onSelect: () => void deleteProject(id) },
  ];
}

export function pageMenu(id: ID): MenuEntry[] {
  const page = st().pages.find((p) => p.id === id);
  const others = st().projects.filter((p) => !p.archivedAt && p.id !== page?.projectId);
  return [
    { label: 'Rename', icon: '✎', onSelect: () => void renamePage(id) },
    ...others.map((p): MenuEntry => ({ label: `Move to ${p.name}`, icon: '→', onSelect: () => st().movePage(id, p.id) })),
    'separator',
    { label: 'Archive', icon: '🗄', onSelect: () => st().archivePage(id) },
    { label: 'Delete…', icon: '🗑', danger: true, onSelect: () => void deletePage(id) },
  ];
}
