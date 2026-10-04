import { useMemo } from 'react';
import { useStore } from './store';
import { collectActionPoints } from './lib/actions';

export function useActionPoints() {
  const entries = useStore((s) => s.entries);
  const pages = useStore((s) => s.pages);
  const projects = useStore((s) => s.projects);
  return useMemo(() => collectActionPoints(entries, pages, projects), [entries, pages, projects]);
}

export function useLiveProjects() {
  const projects = useStore((s) => s.projects);
  return useMemo(() => projects.filter((p) => !p.archivedAt), [projects]);
}

export function useLivePages(projectId: string | undefined) {
  const pages = useStore((s) => s.pages);
  return useMemo(() => pages.filter((p) => p.projectId === projectId && !p.archivedAt), [pages, projectId]);
}
