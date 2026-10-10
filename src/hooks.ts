import { useEffect, useMemo, useState } from 'react';
import { todayIso } from './lib/util';
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

/** Today's date (yyyy-mm-dd) that updates itself at midnight, so long-running sessions stay right. */
export function useToday() {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime() - now.getTime();
    const t = setTimeout(() => setToday(todayIso()), nextMidnight);
    // Also re-check when the window comes back (sleep/hibernate can skip timers).
    const onFocus = () => setToday(todayIso());
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [today]);
  return today;
}
