import { useMemo, useState } from 'react';
import { useActionPoints, useLiveProjects } from '../hooks';
import { useStore } from '../store';
import { ActionList } from './ActionList';
import { newProject } from '../lib/commands';
import { formatDate, todayIso } from '../lib/util';

export function HomeView() {
  const actions = useActionPoints();
  const projects = useLiveProjects();
  const navigate = useStore((s) => s.navigate);
  const [grouped, setGrouped] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const open = actions.filter((a) => a.status === 'open');
  const done = useMemo(
    () => actions.filter((a) => a.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 25),
    [actions],
  );

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">{formatDate(todayIso())}</p>
          <h1>Home</h1>
        </div>
      </header>

      <section className="panel pinned">
        <div className="panel-head">
          <h2>
            <span className="star-icon">★</span> Action points <span className="count">{open.length}</span>
          </h2>
          <div className="seg" role="group" aria-label="Group action points">
            <button type="button" className={grouped ? 'is-on' : ''} onClick={() => setGrouped(true)}>
              By project
            </button>
            <button type="button" className={!grouped ? 'is-on' : ''} onClick={() => setGrouped(false)}>
              All
            </button>
          </div>
        </div>
        {!open.length && <p className="empty-hint">Nothing outstanding. Star a bullet in any meeting to add an action point.</p>}
        {grouped
          ? projects.map((p) => {
              const list = open.filter((a) => a.projectId === p.id);
              if (!list.length) return null;
              return (
                <div key={p.id} className="action-group">
                  <button type="button" className="group-title" onClick={() => navigate({ name: 'project', projectId: p.id })}>
                    <span className="dot" style={{ background: p.color }} /> {p.name}
                    <span className="count">{list.length}</span>
                  </button>
                  <ActionList actions={list} />
                </div>
              );
            })
          : <ActionList actions={open} showProject />}
      </section>

      {done.length > 0 && (
        <section className="panel">
          <button type="button" className="panel-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {showDone ? '▾' : '▸'} Recently completed <span className="count">{done.length}</span>
          </button>
          {showDone && <ActionList actions={done} showProject />}
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Projects</h2>
          <button type="button" className="btn btn-small" onClick={() => void newProject()}>
            ＋ New project
          </button>
        </div>
        {!projects.length && <p className="empty-hint">Create a project to get started.</p>}
        <div className="card-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} projectId={p.id} openCount={open.filter((a) => a.projectId === p.id).length} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectCard({ projectId, openCount }: { projectId: string; openCount: number }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId))!;
  const pageCount = useStore((s) => s.pages.filter((p) => p.projectId === projectId && !p.archivedAt).length);
  const navigate = useStore((s) => s.navigate);
  return (
    <button type="button" className="card project-card" style={{ ['--accent' as string]: project.color }} onClick={() => navigate({ name: 'project', projectId })}>
      <span className="card-title">{project.name}</span>
      <span className="card-meta">
        {pageCount} page{pageCount === 1 ? '' : 's'}
        {openCount > 0 && <span className="badge">★ {openCount}</span>}
      </span>
    </button>
  );
}
