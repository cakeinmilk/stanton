import { useStore } from '../store';
import type { ActionPoint, Project } from '../types';
import { formatDate, formatDateTime } from '../lib/util';
import { projectStyle } from '../lib/theme';
import { FlagIcon } from './Icons';

export function ActionRow({ action, project, showProject }: { action: ActionPoint; project?: Project; showProject?: boolean }) {
  const ownProject = useStore((s) => s.projects.find((p) => p.id === action.projectId));
  const setActionStatus = useStore((s) => s.setActionStatus);
  const navigate = useStore((s) => s.navigate);
  const pageTitle = useStore((s) => s.pages.find((p) => p.id === action.pageId)?.title ?? '');
  const done = action.status === 'done';
  const source = `${action.entryKind === 'meeting' ? formatDate(action.entryDate) + ' · ' : ''}${action.entryTitle || 'Untitled'}`;

  return (
    <li className={`action-row themed${done ? ' is-done' : ''}`} style={projectStyle((project ?? ownProject)?.color)}>
      <button
        type="button"
        className={`ap-check large${done ? ' is-done' : ''}`}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        title={done ? 'Mark as not done' : 'Mark as done'}
        onClick={() => setActionStatus(action.entryId, action.id, done ? 'open' : 'done')}
      >
        {done ? '✓' : ''}
      </button>
      <button
        type="button"
        className="action-body"
        title="Open the meeting or note this came from"
        onClick={() => navigate({ name: 'page', pageId: action.pageId, focusEntryId: action.entryId, focusActionId: action.id })}
      >
        <span className="action-text">
          {action.whole && (
            <span className="whole-tag" title={`The whole ${action.entryKind} is the action point`}>
              <FlagIcon size={13} filled /> {action.entryKind === 'meeting' ? 'Meeting' : 'Note'}
            </span>
          )}
          {action.text}
        </span>
        <span className="action-meta">
          {/* whole-entry actions already name the entry in their text */}
          {showProject && project && (
            <span className="project-chip" style={{ ['--chip' as string]: project.color }}>
              {project.name}
            </span>
          )}
          <span className="action-source">
            {pageTitle} › {source}
          </span>
          {done && action.completedAt && <span className="action-source">· done {formatDateTime(action.completedAt)}</span>}
        </span>
      </button>
    </li>
  );
}

export function ActionList({ actions, showProject, empty }: { actions: ActionPoint[]; showProject?: boolean; empty?: string }) {
  const projects = useStore((s) => s.projects);
  if (!actions.length) return empty ? <p className="empty-hint">{empty}</p> : null;
  return (
    <ul className="action-list">
      {actions.map((a) => (
        <ActionRow key={`${a.entryId}:${a.id}`} action={a} showProject={showProject} project={projects.find((p) => p.id === a.projectId)} />
      ))}
    </ul>
  );
}
