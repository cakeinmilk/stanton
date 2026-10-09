import { useMemo } from 'react';
import { useStore } from '../store';
import { contextMenu } from './Menu';
import { entryLabel, pinIcon } from '../lib/pins';
import { pinMenu } from '../lib/commands';

/** Quick-jump chips for the meetings/notes pinned to a project. */
export function PinnedStrip({ projectId, currentPageId }: { projectId: string; currentPageId?: string }) {
  const entries = useStore((s) => s.entries);
  const pages = useStore((s) => s.pages);
  const navigate = useStore((s) => s.navigate);

  const pinned = useMemo(() => {
    const pageById = new Map(pages.filter((p) => p.projectId === projectId && !p.archivedAt).map((p) => [p.id, p]));
    return entries
      .filter((e) => e.pinnedAt && pageById.has(e.pageId))
      .sort((a, b) => (a.pinnedAt ?? '').localeCompare(b.pinnedAt ?? ''))
      .map((e) => ({ entry: e, page: pageById.get(e.pageId)! }));
  }, [entries, pages, projectId]);

  if (!pinned.length) return null;

  return (
    <nav className="pinned-strip" aria-label="Pinned notes">
      <span className="pinned-label" title="Pinned meetings and notes">
        📌
      </span>
      {pinned.map(({ entry, page }) => (
        <button
          key={entry.id}
          type="button"
          className="pin-chip"
          title={`${entryLabel(entry)} — ${page.title}${page.id === currentPageId ? ' (this page)' : ''}\nRight-click to change the icon or unpin`}
          onClick={() => navigate({ name: 'page', pageId: page.id, focusEntryId: entry.id })}
          onContextMenu={contextMenu(() => pinMenu(entry.id))}
        >
          <span className="pin-icon">{pinIcon(entry)}</span>
          <span className="pin-name">{entry.title.trim() || entryLabel(entry)}</span>
        </button>
      ))}
    </nav>
  );
}
