import { useMemo, useState } from 'react';
import { useActionPoints, useLiveProjects } from '../hooks';
import { useStore } from '../store';
import { ActionList } from './ActionList';
import { newProject, projectMenu } from '../lib/commands';
import { contextMenu, MenuButton } from './Menu';
import { UpcomingDates } from './ImportantDates';
import { SCRATCH_PAGE_ID, SCRATCH_PROJECT } from '../lib/scratch';
import { formatDate, todayIso } from '../lib/util';

export function HomeView() {
  const actions = useActionPoints();
  const projects = useLiveProjects();
  const navigate = useStore((s) => s.navigate);
  const [grouped, setGrouped] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const projectsView = useStore((s) => s.prefs.homeProjectsView);
  const setPrefs = useStore((s) => s.setPrefs);

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

      <UpcomingDates />

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
          ? [...projects, SCRATCH_PROJECT].map((p) => {
              const list = open.filter((a) => a.projectId === p.id);
              if (!list.length) return null;
              return (
                <div key={p.id} className="action-group">
                  <button
                    type="button"
                    className="group-title"
                    onClick={() => navigate(p.id === SCRATCH_PROJECT.id ? { name: 'page', pageId: SCRATCH_PAGE_ID } : { name: 'project', projectId: p.id })}
                  >
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
          <div className="header-actions">
            <div className="seg" role="group" aria-label="Show projects as">
              <button type="button" className={projectsView === 'cards' ? 'is-on' : ''} onClick={() => setPrefs({ homeProjectsView: 'cards' })}>
                ▦ Cards
              </button>
              <button type="button" className={projectsView === 'list' ? 'is-on' : ''} onClick={() => setPrefs({ homeProjectsView: 'list' })}>
                ☰ List
              </button>
            </div>
            <button type="button" className="btn btn-small" onClick={() => void newProject()}>
              ＋ New project
            </button>
          </div>
        </div>
        {!projects.length && <p className="empty-hint">Create a project to get started.</p>}
        {projectsView === 'cards' ? (
          <div className="card-grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} projectId={p.id} openCount={open.filter((a) => a.projectId === p.id).length} />
            ))}
          </div>
        ) : (
          <ul className="project-list page-list">
            {projects.map((p) => (
              <ProjectListRow key={p.id} projectId={p.id} openCount={open.filter((a) => a.projectId === p.id).length} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ projectId, openCount }: { projectId: string; openCount: number }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId))!;
  const pageCount = useStore((s) => s.pages.filter((p) => p.projectId === projectId && !p.archivedAt).length);
  const navigate = useStore((s) => s.navigate);
  return (
    <button type="button" className="card project-card" style={{ ["--accent" as string]: project.color }} onClick={() => navigate({ name: "project", projectId })} onContextMenu={contextMenu(() => projectMenu(projectId))}>
      <span className="card-title">{project.name}</span>
      <span className="card-meta">
        {pageCount} page{pageCount === 1 ? '' : 's'}
        {openCount > 0 && <span className="badge">★ {openCount}</span>}
      </span>
    </button>
  );
}

function ProjectListRow({ projectId, openCount }: { projectId: string; openCount: number }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId))!;
  const pageCount = useStore((s) => s.pages.filter((p) => p.projectId === projectId && !p.archivedAt).length);
  const navigate = useStore((s) => s.navigate);
  const next = (project.dates ?? []).filter((d) => d.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <li className="page-row" onContextMenu={contextMenu(() => projectMenu(projectId))}>
      <button type="button" className="page-row-main" onClick={() => navigate({ name: 'project', projectId })}>
        <span className="dot" style={{ background: project.color }} />
        <span className="page-row-title">{project.name}</span>
        <span className="card-meta">
          {next && `${formatDate(next.date)}: ${next.label} · `}
          {pageCount} page{pageCount === 1 ? '' : 's'}
          {openCount > 0 && <span className="badge">★ {openCount}</span>}
        </span>
      </button>
      <MenuButton items={projectMenu(projectId)} label="Project actions" />
    </li>
  );
}
