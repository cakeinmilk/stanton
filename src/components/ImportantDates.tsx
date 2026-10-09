import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { ImportantDate, Project } from '../types';
import { formatDate, todayIso } from '../lib/util';
import { CalendarIcon } from './Icons';
import { contextMenu } from './Menu';

/** Whole days from today until `iso` (negative = past). */
export function daysUntil(iso: string, today = todayIso()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

export function relativeDay(n: number): string {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n >= 7 && n < 60) return `In ${Math.round(n / 7)} week${Math.round(n / 7) === 1 ? '' : 's'}`;
  if (n < 0) return `${-n} days ago`;
  return `In ${Math.round(n / 30)} months`;
}

const urgency = (n: number) => (n < 0 ? 'past' : n <= 2 ? 'soon' : n <= 14 ? 'near' : 'later');

function DateRow({ project, d, showProject }: { project: Project; d: ImportantDate; showProject?: boolean }) {
  const updateDate = useStore((s) => s.updateDate);
  const removeDate = useStore((s) => s.removeDate);
  const navigate = useStore((s) => s.navigate);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const n = daysUntil(d.date);

  if (editing) {
    return (
      <li className="date-row editing">
        <input type="date" className="text-input small" value={d.date} onChange={(e) => e.target.value && updateDate(project.id, d.id, { date: e.target.value })} aria-label="Date" />
        <input
          className="text-input small grow"
          value={label}
          autoFocus
          aria-label="What's happening"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            updateDate(project.id, d.id, { label: label.trim() || d.label });
            setEditing(false);
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
        />
      </li>
    );
  }
  return (
    <li
      className={`date-row ${urgency(n)}`}
      onContextMenu={contextMenu(() => [
        { label: 'Edit', icon: '✎', onSelect: () => setEditing(true) },
        { label: 'Remove', icon: '🗑', danger: true, onSelect: () => removeDate(project.id, d.id) },
      ])}
    >
      <span className="date-when" title={formatDate(d.date)}>
        <span className="date-day">{formatDate(d.date).replace(/ \d{4}$/, '')}</span>
        <span className="date-rel">{relativeDay(n)}</span>
      </span>
      <button type="button" className="date-label" onClick={() => (showProject ? navigate({ name: 'project', projectId: project.id }) : setEditing(true))} title={showProject ? 'Open project' : 'Click to edit'}>
        {d.label}
        {showProject && (
          <span className="project-chip" style={{ ['--chip' as string]: project.color }}>
            {project.name}
          </span>
        )}
      </button>
      {!showProject && (
        <button type="button" className="icon-btn small" aria-label="Remove date" title="Remove" onClick={() => removeDate(project.id, d.id)}>
          ✕
        </button>
      )}
    </li>
  );
}

/** A project's important dates, with quick add. Past dates fold away. */
export function ProjectDates({ project }: { project: Project }) {
  const addDate = useStore((s) => s.addDate);
  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const all = useMemo(() => [...(project.dates ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [project.dates]);
  const today = todayIso();
  const upcoming = all.filter((d) => d.date >= today);
  const past = all.filter((d) => d.date < today).reverse();

  const submit = () => {
    if (!label.trim()) return;
    addDate(project.id, date, label);
    setLabel('');
    setAdding(false);
  };

  return (
    <section className="panel dates-panel">
      <div className="panel-head">
        <h2>
          <CalendarIcon /> Important dates {upcoming.length > 0 && <span className="count">{upcoming.length}</span>}
        </h2>
        {!adding && (
          <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
            ＋ Add date
          </button>
        )}
      </div>
      {adding && (
        <form
          className="date-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input type="date" className="text-input small" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          <input
            className="text-input small grow"
            placeholder="e.g. Board presentation, go-live, report due"
            value={label}
            autoFocus
            aria-label="What's happening"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
          <button type="submit" className="btn btn-small btn-primary" disabled={!label.trim()}>
            Add
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {!all.length && !adding && <p className="empty-hint">No dates yet. Add deadlines, launches or key meetings.</p>}
      <ul className="date-list">
        {upcoming.map((d) => (
          <DateRow key={d.id} project={project} d={d} />
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <button type="button" className="panel-toggle small" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            {showPast ? '▾' : '▸'} Past dates ({past.length})
          </button>
          {showPast && (
            <ul className="date-list">
              {past.map((d) => (
                <DateRow key={d.id} project={project} d={d} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Next few weeks of dates across all projects, for Home. */
export function UpcomingDates({ days = 21 }: { days?: number }) {
  const projects = useStore((s) => s.projects);
  const today = todayIso();
  const items = projects
    .filter((p) => !p.archivedAt)
    .flatMap((p) => (p.dates ?? []).map((d) => ({ p, d })))
    .filter(({ d }) => d.date >= today && daysUntil(d.date, today) <= days)
    .sort((a, b) => a.d.date.localeCompare(b.d.date));
  if (!items.length) return null;
  return (
    <section className="panel dates-panel">
      <div className="panel-head">
        <h2>
          <CalendarIcon /> Coming up <span className="count">{items.length}</span>
        </h2>
      </div>
      <ul className="date-list">
        {items.map(({ p, d }) => (
          <DateRow key={d.id} project={p} d={d} showProject />
        ))}
      </ul>
    </section>
  );
}
