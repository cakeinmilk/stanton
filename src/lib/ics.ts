import type { CalendarEvent } from './platform';

/** Minimal iCalendar (.ics) reader for meeting invites: SUMMARY, DTSTART/DTEND, LOCATION, ORGANIZER, ATTENDEE, DESCRIPTION. */
export function parseIcs(text: string): CalendarEvent[] {
  // Unfold continuation lines (RFC 5545: CRLF followed by space or tab).
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: CalendarEvent[] = [];
  let cur: Record<string, { params: string; value: string }[]> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      events.push(toEvent(cur));
      cur = null;
    } else if (cur) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m) (cur[m[1]] ??= []).push({ params: m[2], value: m[3] });
    }
  }
  return events;
}

const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** 20261012T090000Z / 20261012T090000 / 20261012 → local yyyy-mm-ddTHH:mm:ss */
function icsDate(v: string): { iso: string; allDay: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
  if (!m) return { iso: v, allDay: false };
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (!m[4]) return { iso: `${y}-${mo}-${d}T00:00:00`, allDay: true };
  const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`, allDay: false };
}

function person(p: { params: string; value: string }) {
  const cn = /CN=("?)([^;:"]+)\1/i.exec(p.params)?.[2];
  return cn ?? p.value.replace(/^mailto:/i, '');
}

function toEvent(f: Record<string, { params: string; value: string }[]>): CalendarEvent {
  const get = (k: string) => unescape(f[k]?.[0]?.value ?? '');
  const start = icsDate(f.DTSTART?.[0]?.value ?? '');
  const end = icsDate(f.DTEND?.[0]?.value ?? f.DTSTART?.[0]?.value ?? '');
  const description = get('DESCRIPTION');
  return {
    id: `ics:${get('UID') || `${get('SUMMARY')}|${start.iso}`}`,
    subject: get('SUMMARY') || '(no subject)',
    start: start.iso,
    end: end.iso,
    allDay: start.allDay,
    location: get('LOCATION'),
    organizer: f.ORGANIZER ? person(f.ORGANIZER[0]) : '',
    attendees: (f.ATTENDEE ?? []).map(person),
    agenda: description.split(/\n_{10,}|Microsoft Teams (meeting|Need help\?)|Join on your computer/i)[0].trim().slice(0, 2000),
    teams: /teams\.microsoft\.com|Microsoft Teams/i.test(`${description} ${get('LOCATION')} ${get('X-MICROSOFT-SKYPETEAMSMEETINGURL')}`),
  };
}
