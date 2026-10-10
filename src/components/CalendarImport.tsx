import { useEffect, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { useStore } from '../store';
import { bridge, errorMessage, isElectron, type CalendarEvent } from '../lib/platform';
import { parseIcs } from '../lib/ics';
import { formatDate } from '../lib/util';
import { CalendarIcon } from './Icons';

type Range = { label: string; offset: number; days: number };
const RANGES: Range[] = [
  { label: 'Today', offset: 0, days: 1 },
  { label: 'Tomorrow', offset: 1, days: 1 },
  { label: 'Next 7 days', offset: 0, days: 7 },
  { label: 'Last 7 days', offset: -7, days: 7 },
];

const time = (iso: string) => iso.slice(11, 16);
const para = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const bold = (label: string, text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: label, marks: [{ type: 'bold' }] }, { type: 'text', text }] });

/** Meeting notes skeleton from a calendar event. */
export function eventToDoc(ev: CalendarEvent, opts: { attendees: boolean; agenda: boolean }): JSONContent {
  const content: JSONContent[] = [];
  const when = ev.allDay ? 'All day' : `${time(ev.start)}–${time(ev.end)}`;
  const where = ev.teams ? 'Teams meeting' : ev.location;
  content.push(bold('When: ', `${when}${where ? ` · ${where}` : ''}`));
  if (ev.organizer) content.push(bold('Organiser: ', ev.organizer));
  if (opts.attendees && ev.attendees.length) content.push(bold('Attendees: ', ev.attendees.join(', ')));
  const agenda = opts.agenda ? ev.agenda.split('\n').map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean) : [];
  if (agenda.length) {
    content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Agenda' }] });
    content.push({ type: 'bulletList', content: agenda.slice(0, 40).map((l) => ({ type: 'listItem', content: [para(l)] })) });
  }
  content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Notes' }] });
  content.push({ type: 'bulletList', content: [{ type: 'listItem', content: [para('')] }] });
  return { type: 'doc', content };
}

/** "From calendar" dialog: pick meetings from Outlook (or an .ics invite) and start notes for them on this page. */
export function CalendarImport({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const entries = useStore((s) => s.entries);
  const [range, setRange] = useState<Range>(RANGES[0]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [opts, setOpts] = useState({ attendees: true, agenda: true });
  const [source, setSource] = useState<'outlook' | 'ics'>('outlook');

  const load = async (r: Range) => {
    setRange(r);
    setSource('outlook');
    setStatus('loading');
    setError(null);
    try {
      setEvents(await bridge.outlookEvents(r.offset, r.days));
      setStatus('idle');
    } catch (e) {
      setEvents([]);
      setError(errorMessage(e));
      setStatus('error');
    }
  };

  useEffect(() => {
    if (isElectron) void load(RANGES[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const importIcs = async () => {
    const file = await bridge.openFile([{ name: 'Calendar invite', extensions: ['ics', 'ical', 'vcs'] }]);
    if (!file) return;
    const evs = parseIcs(file.content);
    setSource('ics');
    setEvents(evs);
    setError(evs.length ? null : 'No meetings found in that file.');
    setStatus(evs.length ? 'idle' : 'error');
  };

  const added = (ev: CalendarEvent) => entries.find((e) => e.sourceId === ev.id);

  const add = (ev: CalendarEvent) => {
    const st = useStore.getState();
    const id = st.addEntry(pageId, 'meeting');
    st.updateEntry(id, { title: ev.subject, date: ev.start.slice(0, 10) });
    st.setEntryContent(id, eventToDoc(ev, opts));
    useStore.setState((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, sourceId: ev.id } : e)) }));
    st.navigate({ name: 'page', pageId, focusEntryId: id });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Add meetings from your calendar" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>
          <CalendarIcon /> Add from calendar
        </h2>
        {isElectron && (
          <div className="seg" role="group" aria-label="Which days">
            {RANGES.map((r) => (
              <button key={r.label} type="button" className={source === 'outlook' && range.label === r.label ? 'is-on' : ''} onClick={() => void load(r)}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        <div className="cal-options">
          <label className="check">
            <input type="checkbox" checked={opts.attendees} onChange={(e) => setOpts((o) => ({ ...o, attendees: e.target.checked }))} /> Attendees
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.agenda} onChange={(e) => setOpts((o) => ({ ...o, agenda: e.target.checked }))} /> Agenda from the invite
          </label>
        </div>

        <div className="cal-list">
          {status === 'loading' && <p className="empty-hint">Reading your Outlook calendar…</p>}
          {status === 'error' && <p className="setting-status error">{error}</p>}
          {status === 'idle' && !events.length && <p className="empty-hint">No meetings {source === 'outlook' ? `for ${range.label.toLowerCase()}` : 'in that file'}.</p>}
          {events.map((ev) => {
            const done = added(ev);
            return (
              <div key={ev.id} className="cal-row">
                <span className="cal-when">
                  <b>{ev.allDay ? 'All day' : time(ev.start)}</b>
                  <small>{range.days > 1 || source === 'ics' ? formatDate(ev.start.slice(0, 10)) : ev.allDay ? '' : `–${time(ev.end)}`}</small>
                </span>
                <span className="cal-main">
                  <span className="cal-subject">{ev.subject}</span>
                  <small>
                    {ev.teams ? 'Teams' : ev.location}
                    {ev.attendees.length ? ` · ${ev.attendees.length} attendee${ev.attendees.length === 1 ? '' : 's'}` : ''}
                  </small>
                </span>
                {done ? (
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => useStore.getState().navigate({ name: 'page', pageId: done.pageId, focusEntryId: done.id })}>
                    Added ✓
                  </button>
                ) : (
                  <button type="button" className="btn btn-small btn-primary" onClick={() => add(ev)}>
                    ＋ Add
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void importIcs()} title="For the new Outlook app or invites from others: save the invite as an .ics file">
            Open .ics invite…
          </button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
