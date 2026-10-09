import { useMemo, useState, type DragEvent } from 'react';
import { useActionPoints, useLivePages } from '../hooks';
import { useStore } from '../store';
import { ActionList } from './ActionList';
import { contextMenu, MenuButton } from './Menu';
import { PinnedStrip } from './PinnedStrip';
import { newPage, pageMenu, projectMenu } from '../lib/commands';
import { formatDate, PROJECT_COLORS } from '../lib/util';
import { InlineTitle } from './InlineTitle';
import { projectStyle } from '../lib/theme';

export function ProjectView({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useStore((s) => s.updateProject);
  const navigate = useStore((s) => s.navigate);
  const pages = useLivePages(projectId);
  const entries = useStore((s) => s.entries);
  const actions = useActionPoints();
  const open = actions.filter((a) => a.projectId === projectId && a.status === 'open');

  const pageInfo = useMemo(() => {
    const info = new Map<string, { count: number; latest: string | null }>();
    for (const e of entries) {
      const i = info.get(e.pageId) ?? { count: 0, latest: null };
      i.count++;
      if (!i.latest || e.date > i.latest) i.latest = e.date;
      info.set(e.pageId, i);
    }
    return info;
  }, [entries]);

  const movePageTo = useStore((s) => s.movePageTo);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; where: 'before' | 'after' } | null>(null);

  if (!project) return null;

  const onDragOver = (id: string) => (e: DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (over?.id !== id || over.where !== where) setOver({ id, where });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId && over && dragId !== over.id) {
      const i = pages.findIndex((p) => p.id === over.id);
      const before = over.where === 'before' ? over.id : pages[i + 1]?.id ?? null;
      if (before !== dragId) movePageTo(dragId, projectId, before);
    }
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="view themed" style={projectStyle(project.color)}>
      <header className="view-header" onContextMenu={contextMenu(() => projectMenu(projectId))}>
        <div className="grow">
          <p className="eyebrow">
            <span className="dot" style={{ background: project.color }} /> Project
          </p>
          <InlineTitle value={project.name} onChange={(name) => updateProject(projectId, { name })} placeholder="Project name" />
        </div>
        <div className="header-actions">
          <div className="swatches" aria-label="Project colour">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === project.color ? ' is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => updateProject(projectId, { color: c })}
              />
            ))}
            <label className={`swatch custom${PROJECT_COLORS.includes(project.color) ? '' : ' is-on'}`} title="Custom colour" style={PROJECT_COLORS.includes(project.color) ? undefined : { background: project.color }}>
              <input type="color" value={project.color} aria-label="Custom project colour" onChange={(e) => updateProject(projectId, { color: e.target.value })} />
            </label>
          </div>
          <MenuButton items={projectMenu(projectId)} label="Project actions" />
        </div>
      </header>

      <PinnedStrip projectId={projectId} />

      <section className="panel pinned">
        <div className="panel-head">
          <h2>
            <span className="star-icon">★</span> Pinned action points <span className="count">{open.length}</span>
          </h2>
        </div>
        <ActionList actions={open} empty="No open action points in this project." />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Pages</h2>
          <button type="button" className="btn btn-small btn-primary" onClick={() => void newPage(projectId)}>
            ＋ New page
          </button>
        </div>
        {!pages.length && <p className="empty-hint">No pages yet. Pages hold your meetings and notes.</p>}
        <ul className="page-list">
          {pages.map((p) => {
            const info = pageInfo.get(p.id);
            return (
              <li
                key={p.id}
                className={`page-row${over?.id === p.id ? ` drop-${over.where}` : ''}${dragId === p.id ? ' is-dragging' : ''}`}
                draggable
                title="Drag to reorder"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', '');
                  setDragId(p.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOver(null);
                }}
                onDragOver={onDragOver(p.id)}
                onDrop={onDrop}
                onContextMenu={contextMenu(() => pageMenu(p.id))}
              >
                <span className="drag-handle" aria-hidden>
                  ⋮⋮
                </span>
                <button type="button" className="page-row-main" onClick={() => navigate({ name: 'page', pageId: p.id })}>
                  <span className="page-icon">📄</span>
                  <span className="page-row-title">{p.title}</span>
                  <span className="card-meta">
                    {info?.count ?? 0} item{info?.count === 1 ? '' : 's'}
                    {info?.latest && ` · ${formatDate(info.latest)}`}
                  </span>
                </button>
                <MenuButton items={pageMenu(p.id)} label="Page actions" />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
