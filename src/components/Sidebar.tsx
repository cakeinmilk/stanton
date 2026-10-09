import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useActionPoints, useLiveProjects } from '../hooks';
import { contextMenu, MenuButton } from './Menu';
import { movePageWithWarning, newPage, newProject, pageMenu, projectMenu } from '../lib/commands';
import type { DragEvent } from 'react';

type Drag = { kind: 'project' | 'page'; id: string } | null;
type Over = { id: string; kind: 'project' | 'page'; where: 'before' | 'after' | 'into' } | null;

const DRAG_MIME = 'application/x-stanton';

/** Upper or lower half of the row under the pointer. */
function half(e: DragEvent): 'before' | 'after' {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return e.clientY < r.top + r.height / 2 ? 'before' : 'after';
}
import { nodeText } from '../lib/actions';
import { formatDate } from '../lib/util';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const view = useStore((s) => s.view);
  const navigate = useStore((s) => s.navigate);
  const pages = useStore((s) => s.pages);
  const archivedCount = useStore((s) => s.projects.filter((p) => p.archivedAt).length + s.pages.filter((p) => p.archivedAt).length);
  const projects = useLiveProjects();
  const actions = useActionPoints();
  const openCount = actions.filter((a) => a.status === 'open').length;
  const [query, setQuery] = useState('');

  const currentProjectId =
    view.name === 'project' ? view.projectId : view.name === 'page' ? pages.find((p) => p.id === view.pageId)?.projectId : undefined;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<Over>(null);
  const moveProjectBefore = useStore((s) => s.moveProjectBefore);

  const startDrag = (kind: 'project' | 'page', id: string) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.setData('text/plain', '');
    setDrag({ kind, id });
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  // Hovering a project row: projects reorder (before/after); pages drop into that project.
  const overProject = (projectId: string) => (e: DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const where = drag.kind === 'project' ? half(e) : 'into';
    if (over?.id !== projectId || over.where !== where) setOver({ id: projectId, kind: 'project', where });
  };
  // Hovering a page row: only pages can be dropped here.
  const overPage = (pageId: string) => (e: DragEvent) => {
    if (drag?.kind !== 'page') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const where = half(e);
    if (over?.id !== pageId || over.where !== where) setOver({ id: pageId, kind: 'page', where });
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag;
    const o = over;
    endDrag();
    if (!d || !o || d.id === o.id) return;
    if (d.kind === 'project' && o.kind === 'project') {
      const i = projects.findIndex((p) => p.id === o.id);
      const before = o.where === 'before' ? o.id : projects[i + 1]?.id ?? null;
      if (before !== d.id) moveProjectBefore(d.id, before);
    } else if (d.kind === 'page' && o.kind === 'project') {
      void movePageWithWarning(d.id, o.id, null);
    } else if (d.kind === 'page' && o.kind === 'page') {
      const target = pages.find((p) => p.id === o.id);
      if (!target) return;
      const siblings = pages.filter((p) => p.projectId === target.projectId && !p.archivedAt);
      const i = siblings.findIndex((p) => p.id === o.id);
      const before = o.where === 'before' ? o.id : siblings[i + 1]?.id ?? null;
      if (before !== d.id) void movePageWithWarning(d.id, target.projectId, before);
    }
  };
  const dropClass = (id: string) => (over?.id === id ? ` drop-${over.where}` : '');

  const go = (v: Parameters<typeof navigate>[0]) => {
    navigate(v);
    onNavigate?.();
  };

  return (
    <nav className="sidebar" aria-label="Projects and pages">
      <div className="search">
        <input type="search" placeholder="Search notes…" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {query.trim() ? (
        <SearchResults query={query.trim()} onPick={() => { setQuery(''); onNavigate?.(); }} />
      ) : (
        <>
          <button type="button" className={`nav-item${view.name === 'home' ? ' is-active' : ''}`} onClick={() => go({ name: 'home' })}>
            <span className="nav-icon">⌂</span> Home
            {openCount > 0 && <span className="badge">★ {openCount}</span>}
          </button>
          <button type="button" className={`nav-item${view.name === 'plan' ? ' is-active' : ''}`} onClick={() => go({ name: 'plan' })}>
            <span className="nav-icon">✦</span> Weekly plan
          </button>

          <div className="nav-section">
            <span>Projects</span>
            <button type="button" className="icon-btn small" title="New project" aria-label="New project" onClick={() => void newProject()}>
              ＋
            </button>
          </div>

          <div className="nav-tree">
            {projects.map((p) => {
              const isCollapsed = collapsed[p.id] ?? p.id !== currentProjectId;
              const projectPages = pages.filter((pg) => pg.projectId === p.id && !pg.archivedAt);
              const pc = actions.filter((a) => a.projectId === p.id && a.status === 'open').length;
              return (
                <div key={p.id} className={`nav-project${drag?.id === p.id ? ' is-dragging' : ''}`} style={{ ['--project' as string]: p.color }}>
                  <div
                    className={`nav-row${view.name === 'project' && view.projectId === p.id ? ' is-active' : ''}${dropClass(p.id)}`}
                    draggable
                    onDragStart={startDrag('project', p.id)}
                    onDragEnd={endDrag}
                    onDragOver={overProject(p.id)}
                    onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && over?.id === p.id && setOver(null)}
                    onDrop={drop}
                    onContextMenu={contextMenu(() => projectMenu(p.id))}
                    title="Drag to reorder"
                  >
                    <button
                      type="button"
                      className="twisty"
                      aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((c) => ({ ...c, [p.id]: !isCollapsed }))}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                    <button
                      type="button"
                      className="nav-label"
                      onClick={() => {
                        setCollapsed((c) => ({ ...c, [p.id]: false }));
                        go({ name: 'project', projectId: p.id });
                      }}
                    >
                      <span className="dot" style={{ background: p.color }} />
                      <span className="truncate">{p.name}</span>
                      {pc > 0 && <span className="badge small">{pc}</span>}
                    </button>
                    <MenuButton items={projectMenu(p.id)} label={`${p.name} actions`} className="row-menu" />
                  </div>
                  {!isCollapsed && (
                    <div className="nav-pages">
                      {projectPages.map((pg) => (
                        <div
                          key={pg.id}
                          className={`nav-row page${view.name === 'page' && view.pageId === pg.id ? ' is-active' : ''}${dropClass(pg.id)}${drag?.id === pg.id ? ' is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            startDrag('page', pg.id)(e);
                          }}
                          onDragEnd={endDrag}
                          onDragOver={overPage(pg.id)}
                          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && over?.id === pg.id && setOver(null)}
                          onDrop={drop}
                          onContextMenu={contextMenu(() => pageMenu(pg.id))}
                          title="Drag to reorder, or onto another project to move it"
                        >
                          <button type="button" className="nav-label" onClick={() => go({ name: 'page', pageId: pg.id })}>
                            <span className="truncate">{pg.title}</span>
                          </button>
                          <MenuButton items={pageMenu(pg.id)} label={`${pg.title} actions`} className="row-menu" />
                        </div>
                      ))}
                      <button type="button" className="nav-add" onClick={() => void newPage(p.id)}>
                        ＋ Add page
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!projects.length && (
              <button type="button" className="nav-add" onClick={() => void newProject()}>
                ＋ Create your first project
              </button>
            )}
          </div>

          <div className="nav-foot">
            <button type="button" className={`nav-item${view.name === 'archive' ? ' is-active' : ''}`} onClick={() => go({ name: 'archive' })}>
              <span className="nav-icon">🗄</span> Archive
              {archivedCount > 0 && <span className="count">{archivedCount}</span>}
            </button>
          </div>
        </>
      )}
    </nav>
  );
}

function SearchResults({ query, onPick }: { query: string; onPick: () => void }) {
  const entries = useStore((s) => s.entries);
  const pages = useStore((s) => s.pages);
  const projects = useStore((s) => s.projects);
  const navigate = useStore((s) => s.navigate);

  const results = useMemo(() => {
    const q = query.toLowerCase();
    const livePage = new Map(
      pages.filter((p) => !p.archivedAt && projects.some((pr) => pr.id === p.projectId && !pr.archivedAt)).map((p) => [p.id, p]),
    );
    const pageHits = [...livePage.values()].filter((p) => p.title.toLowerCase().includes(q));
    const entryHits = entries
      .filter((e) => livePage.has(e.pageId))
      .map((e) => {
        const text = nodeText(e.content, true);
        const idx = text.toLowerCase().indexOf(q);
        const titleHit = e.title.toLowerCase().includes(q);
        if (idx < 0 && !titleHit) return null;
        const snippet = idx >= 0 ? (idx > 30 ? '…' : '') + text.slice(Math.max(0, idx - 30), idx + q.length + 50) : text.slice(0, 80);
        return { entry: e, snippet };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
      .slice(0, 50);
    return { pageHits, entryHits, livePage };
  }, [query, entries, pages, projects]);

  return (
    <div className="search-results">
      {!results.pageHits.length && !results.entryHits.length && <p className="empty-hint">No matches.</p>}
      {results.pageHits.map((p) => (
        <button key={p.id} type="button" className="search-hit" onClick={() => { navigate({ name: 'page', pageId: p.id }); onPick(); }}>
          <span className="hit-title">📄 {p.title}</span>
        </button>
      ))}
      {results.entryHits.map(({ entry, snippet }) => (
        <button
          key={entry.id}
          type="button"
          className="search-hit"
          onClick={() => {
            navigate({ name: 'page', pageId: entry.pageId, focusEntryId: entry.id });
            onPick();
          }}
        >
          <span className="hit-title">
            {entry.kind === 'meeting' ? `${formatDate(entry.date)} · ` : ''}
            {entry.title || 'Untitled'}
          </span>
          <span className="hit-meta">{results.livePage.get(entry.pageId)?.title}</span>
          <span className="hit-snippet">{snippet}</span>
        </button>
      ))}
    </div>
  );
}
