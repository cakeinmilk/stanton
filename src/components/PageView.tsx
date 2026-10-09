import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Entry, EntryKind } from '../types';
import { NoteEditor } from '../editor/NoteEditor';
import { contextMenu, MenuButton, type MenuEntry } from './Menu';
import { PinnedStrip } from './PinnedStrip';
import { InlineTitle } from './InlineTitle';
import { deleteEntry, pageMenu, pinMenu } from '../lib/commands';
import { pinIcon } from '../lib/pins';
import { FlagIcon, PinIcon } from './Icons';
import { extractActions, nodeText } from '../lib/actions';
import { formatDate, formatDateTime, todayIso } from '../lib/util';
import { projectStyle } from '../lib/theme';

export function PageView({ pageId, focusEntryId, focusActionId }: { pageId: string; focusEntryId?: string; focusActionId?: string }) {
  const page = useStore((s) => s.pages.find((p) => p.id === pageId));
  const project = useStore((s) => s.projects.find((p) => p.id === page?.projectId));
  const allEntries = useStore((s) => s.entries);
  const sort = useStore((s) => s.prefs.entrySort);
  const setEntrySort = useStore((s) => s.setEntrySort);
  const addEntry = useStore((s) => s.addEntry);
  const renamePage = useStore((s) => s.renamePage);
  const navigate = useStore((s) => s.navigate);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    const list = allEntries.filter((e) => e.pageId === pageId);
    list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    if (sort === 'newest') list.reverse();
    return list;
  }, [allEntries, pageId, sort]);

  // Jump to an entry / action point when navigated from an action list.
  useEffect(() => {
    if (!focusEntryId) return;
    const st = useStore.getState();
    if (st.entries.find((e) => e.id === focusEntryId)?.collapsed) st.updateEntry(focusEntryId, { collapsed: false });
    const t = setTimeout(() => {
      const root = listRef.current;
      const card = root?.querySelector<HTMLElement>(`[data-entry-id="${focusEntryId}"]`);
      const target = (focusActionId && card?.querySelector<HTMLElement>(`li[data-action-id="${focusActionId}"]`)) || card;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    }, 60);
    return () => clearTimeout(t);
  }, [focusEntryId, focusActionId, pageId]);

  if (!page || !project) return null;

  const add = (kind: EntryKind) => {
    const id = addEntry(pageId, kind);
    setJustAdded(id);
    setTimeout(() => listRef.current?.querySelector(`[data-entry-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  return (
    <div className="view themed" style={projectStyle(project.color)}>
      <header className="view-header" onContextMenu={contextMenu(() => pageMenu(pageId))}>
        <div className="grow">
          <button type="button" className="eyebrow link" onClick={() => navigate({ name: 'project', projectId: project.id })}>
            <span className="dot" style={{ background: project.color }} /> {project.name}
          </button>
          <InlineTitle value={page.title} onChange={(t) => renamePage(pageId, t)} placeholder="Page title" />
        </div>
        <div className="header-actions">
          <MenuButton items={pageMenu(pageId)} label="Page actions" />
        </div>
      </header>

      <PinnedStrip projectId={project.id} pageId={pageId} />

      <div className="page-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => add('meeting')}>
          ＋ Meeting
        </button>
        <button type="button" className="btn btn-accent" onClick={() => add('note')}>
          ＋ Note
        </button>
        <span className="grow" />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          title="Change sort order"
          onClick={() => setEntrySort(sort === 'newest' ? 'oldest' : 'newest')}
        >
          {sort === 'newest' ? '↓ Newest first' : '↑ Oldest first'}
        </button>
      </div>

      <div className="entries" ref={listRef}>
        {!entries.length && <p className="empty-hint">This page is empty. Add a meeting or a note to begin.</p>}
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} isNew={e.id === justAdded} />
        ))}
      </div>
    </div>
  );
}

function EntryCard({ entry, isNew }: { entry: Entry; isNew: boolean }) {
  const updateEntry = useStore((s) => s.updateEntry);
  const setEntryContent = useStore((s) => s.setEntryContent);
  const rev = useStore((s) => s.externalRev[entry.id] ?? 0);
  const isMeeting = entry.kind === 'meeting';
  const actions = useMemo(() => extractActions(entry.content), [entry.content]);
  const openCount = actions.filter((a) => a.status === 'open').length;
  const [title, setTitle] = useState(entry.title);
  useEffect(() => setTitle(entry.title), [entry.title]);
  // Once there are notes, an empty title stays blank instead of showing "Meeting title" (it reappears on hover/focus).
  const hasNotes = useMemo(() => nodeText(entry.content, true).trim().length > 0 || JSON.stringify(entry.content).includes('"image"'), [entry.content]);
  const setEntryPin = useStore((s) => s.setEntryPin);
  const setEntryAction = useStore((s) => s.setEntryAction);

  const menu = (): MenuEntry[] => [
    entry.action
      ? { label: `Remove ${entry.kind} action point`, icon: <FlagIcon size={15} />, onSelect: () => setEntryAction(entry.id, null) }
      : { label: `Make whole ${entry.kind} an action point`, icon: <FlagIcon size={15} filled />, onSelect: () => setEntryAction(entry.id, 'open') },
    ...pinMenu(entry.id),
    'separator',
    isMeeting
      ? { label: 'Convert to note', icon: '📝', onSelect: () => updateEntry(entry.id, { kind: 'note' }) }
      : { label: 'Convert to meeting', icon: '👥', onSelect: () => updateEntry(entry.id, { kind: 'meeting' }) },
    ...(!isMeeting ? [{ label: 'Set date to today', icon: '📅', onSelect: () => updateEntry(entry.id, { date: todayIso() }) }] : []),
    'separator',
    { label: 'Delete…', icon: '🗑', danger: true, onSelect: () => void deleteEntry(entry.id) },
  ];

  return (
    <article className={`entry-card kind-${entry.kind}${entry.action ? ` whole-${entry.action}` : ''}`} data-entry-id={entry.id}>
      <header className="entry-head" onContextMenu={contextMenu(menu)}>
        <button
          type="button"
          className="icon-btn collapse-btn"
          aria-label={entry.collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!entry.collapsed}
          onClick={() => updateEntry(entry.id, { collapsed: !entry.collapsed })}
        >
          {entry.collapsed ? '▸' : '▾'}
        </button>
        <span className={`kind-badge ${entry.kind}`}>{isMeeting ? 'Meeting' : 'Note'}</span>
        {isMeeting ? (
          <label className="date-chip" title="Meeting date">
            <span className="sr-only">Meeting date</span>
            <input type="date" value={entry.date} required onChange={(e) => e.target.value && updateEntry(entry.id, { date: e.target.value })} />
          </label>
        ) : null}
        <input
          className={`entry-title${!title && hasNotes ? ' quiet-placeholder' : ''}`}
          value={title}
          placeholder={isMeeting ? 'Meeting title' : 'Note title'}
          aria-label="Title"
          autoFocus={isNew}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== entry.title && updateEntry(entry.id, { title })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
              e.preventDefault();
              setEntryAction(entry.id, entry.action ? null : 'open');
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              (e.currentTarget.closest('.entry-card')?.querySelector('.ProseMirror') as HTMLElement | null)?.focus();
            }
          }}
        />
        {entry.pinnedAt && (
          <button
            type="button"
            className="pin-flag"
            title="Pinned to this page and its project – click to unpin"
            aria-label="Unpin"
            onClick={() => setEntryPin(entry.id, { pinned: false })}
          >
            {pinIcon(entry) ?? <PinIcon size={16} />}
          </button>
        )}
        <button
          type="button"
          className={`whole-action${entry.action ? ` is-${entry.action}` : ''}`}
          title={entry.action ? 'This whole ' + entry.kind + ' is an action point – click to remove' : `Make this whole ${entry.kind} an action point (Ctrl+Shift+A in the title)`}
          aria-label={entry.action ? 'Remove whole-' + entry.kind + ' action point' : 'Make this ' + entry.kind + ' an action point'}
          aria-pressed={!!entry.action}
          onClick={() => setEntryAction(entry.id, entry.action ? null : 'open')}
        >
          <FlagIcon size={16} filled={!!entry.action} />
        </button>
        {entry.action && (
          <button
            type="button"
            className={`ap-check${entry.action === 'done' ? ' is-done' : ''}`}
            title={entry.action === 'done' ? 'Mark as not done' : 'Mark as done'}
            aria-label={entry.action === 'done' ? 'Mark as not done' : 'Mark as done'}
            onClick={() => setEntryAction(entry.id, entry.action === 'done' ? 'open' : 'done')}
          >
            {entry.action === 'done' ? '✓' : ''}
          </button>
        )}
        {openCount > 0 && (
          <span className="badge" title={`${openCount} open action point${openCount === 1 ? '' : 's'}`}>
            ★ {openCount}
          </span>
        )}
        <MenuButton label="Entry actions" items={menu()} />
      </header>
      {!entry.collapsed && (
        <>
          <NoteEditor
            content={entry.content}
            externalRev={rev}
            placeholder={isMeeting ? 'Bullet points… click ☆ to make one an action point' : 'Write, paste text or images…'}
            onChange={(c) => setEntryContent(entry.id, c)}
          />
          <footer className="entry-foot">
            {isMeeting ? formatDate(entry.date) : `Note · ${formatDate(entry.date)}`} · edited {formatDateTime(entry.updatedAt)}
          </footer>
        </>
      )}
    </article>
  );
}
