import type { Page, Project } from '../types';

/** The Scratchpad is a page that belongs to no project; it lives under Home. */
export const SCRATCH_PROJECT_ID = '__scratch';
export const SCRATCH_PAGE_ID = 'scratchpad';

export const isScratchPage = (p: Pick<Page, 'id'> | null | undefined) => p?.id === SCRATCH_PAGE_ID;

export function scratchPage(): Page {
  return { id: SCRATCH_PAGE_ID, projectId: SCRATCH_PROJECT_ID, title: 'Scratchpad', createdAt: new Date().toISOString() };
}

/** Stand-in "project" so the Scratchpad can be shown and themed like any page. */
export const SCRATCH_PROJECT: Project = { id: SCRATCH_PROJECT_ID, name: 'Scratchpad', color: '#7a8a99', createdAt: '' };

/** Pages that are visible: in a live project, or the Scratchpad. */
export function isLivePage(page: Page, liveProjectIds: Set<string>) {
  return !page.archivedAt && (page.projectId === SCRATCH_PROJECT_ID || liveProjectIds.has(page.projectId));
}
