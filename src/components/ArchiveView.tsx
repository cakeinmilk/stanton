import { useStore } from '../store';
import { deletePage, deleteProject } from '../lib/commands';
import { formatDateTime } from '../lib/util';

export function ArchiveView() {
  const projects = useStore((s) => s.projects);
  const pages = useStore((s) => s.pages);
  const restoreProject = useStore((s) => s.restoreProject);
  const restorePage = useStore((s) => s.restorePage);

  const archivedProjects = projects.filter((p) => p.archivedAt);
  // Pages archived on their own (not just hidden because their project is archived).
  const archivedPages = pages.filter((p) => p.archivedAt);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Unknown project';

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Hidden from everywhere else</p>
          <h1>Archive</h1>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Projects</h2>
        </div>
        {!archivedProjects.length && <p className="empty-hint">No archived projects.</p>}
        <ul className="page-list">
          {archivedProjects.map((p) => (
            <li key={p.id} className="page-row">
              <div className="page-row-main static">
                <span className="dot" style={{ background: p.color }} />
                <span className="page-row-title">{p.name}</span>
                <span className="card-meta">archived {formatDateTime(p.archivedAt!)}</span>
              </div>
              <button type="button" className="btn btn-small" onClick={() => restoreProject(p.id)}>
                Restore
              </button>
              <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => void deleteProject(p.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Pages</h2>
        </div>
        {!archivedPages.length && <p className="empty-hint">No archived pages.</p>}
        <ul className="page-list">
          {archivedPages.map((p) => (
            <li key={p.id} className="page-row">
              <div className="page-row-main static">
                <span className="page-icon">📄</span>
                <span className="page-row-title">{p.title}</span>
                <span className="card-meta">
                  {projectName(p.projectId)} · archived {formatDateTime(p.archivedAt!)}
                </span>
              </div>
              <button type="button" className="btn btn-small" onClick={() => restorePage(p.id)}>
                Restore
              </button>
              <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => void deletePage(p.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
