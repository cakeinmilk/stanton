import { useMemo } from 'react';
import { useStore } from '../store';
import { contextMenu } from './Menu';
import { entryLabel, pinIcon } from '../lib/pins';
import { pinMenu } from '../lib/commands';
import { PinIcon } from './Icons';

/**
 * Quick-jump chips for pinned meetings/notes. On a project, all pins in the project;
 * on a page (`pageId`), only that page's own pins.
 */
export function PinnedStrip({ projectId, pageId }: { projectId: string; pageId?: string }) {
  const entries = useStore((s) => s.entries);
  const pages = useStore((s) => s.pages);
  const navigate = useStore((s) => s.navigate);

  const pinned = useMemo(() => {
    const pageById = new Map(pages.filter((p) => p.projectId === projectId && !p.archivedAt).map((p) => [p.id, p]));
    return entries
      .filter((e) => e.pinnedAt && pageById.has(e.pageId) && (!pageId || e.pageId === pageId))
      .sort((a, b) => (a.pinnedAt ?? '').localeCompare(b.pinnedAt ?? ''))
      .map((e) => ({ entry: e, page: pageById.get(e.pageId)! }));
  }, [entries, pages, projectId, pageId]);

  if (!pinned.length) return null;

  return (
    <nav className="pinned-strip" aria-label="Pinned notes">
      <span className="pinned-label" title={pageId ? 'Pinned on this page' : 'Pinned in this project'}>
        Pinned
      </span>
      {pinned.map(({ entry, page }) => (
        <button
          key={entry.id}
          type="button"
          className="pin-chip"
          title={`${entryLabel(entry)} — ${page.title}\nRight-click to change the icon or unpin`}
          onClick={() => navigate({ name: 'page', pageId: page.id, focusEntryId: entry.id })}
          onContextMenu={contextMenu(() => pinMenu(entry.id))}
        >
          <span className="pin-icon">{pinIcon(entry) ?? <PinIcon size={15} />}</span>
          <span className="pin-name">{entry.title.trim() || entryLabel(entry)}</span>
        </button>
      ))}
    </nav>
  );
}
