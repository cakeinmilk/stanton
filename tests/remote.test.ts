import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store';
import { handleRemoteMessage, linesToDoc } from '../src/lib/remote';
import { parseIcs } from '../src/lib/ics';
import { emptyData } from '../src/lib/seed';
import { SCRATCH_PAGE_ID } from '../src/lib/scratch';
import { collectActionPoints, extractActions } from '../src/lib/actions';
import { todayIso } from '../src/lib/util';

const scratch = () => useStore.getState().entries.filter((e) => e.pageId === SCRATCH_PAGE_ID);

describe('Telegram commands', () => {
  beforeEach(() => {
    useStore.setState({ ...emptyData(), loaded: true });
  });

  it('saves a plain message to the Scratchpad, bullets included', async () => {
    const reply = await handleRemoteMessage({ text: 'Call with Jake\n- thresholds agreed\n- Matt to start Tuesday', from: 'me' });
    expect(reply).toMatch(/Scratchpad/);
    const [e] = scratch();
    expect(e.title).toBe('📱 Call with Jake');
    expect(e.content.content?.[0].type).toBe('bulletList');
    expect(e.content.content?.[0].content).toHaveLength(2);
  });

  it('/todo adds starred action points that show up on Home', async () => {
    await handleRemoteMessage({ text: '/todo Send budget\nBook room', from: 'me' });
    const s = useStore.getState();
    const actions = collectActionPoints(s.entries, s.pages, s.projects);
    expect(actions.map((a) => a.text)).toEqual(['Send budget', 'Book room']);
    expect(actions[0].projectId).toBe('__scratch');
  });

  it('/actions then /done ticks an item off', async () => {
    await handleRemoteMessage({ text: '/todo One\nTwo', from: 'me' });
    const list = await handleRemoteMessage({ text: '/actions', from: 'me' });
    expect(list).toContain('1. One');
    expect(await handleRemoteMessage({ text: '/done 2', from: 'me' })).toBe('✓ Done: Two');
    const statuses = extractActions(scratch()[0].content).map((a) => a.status);
    expect(statuses).toEqual(['open', 'done']);
    expect(await handleRemoteMessage({ text: '/done 9', from: 'me' })).toMatch(/Pick a number/);
  });

  it('/today lists today’s important dates', async () => {
    const id = useStore.getState().addProject('Client A');
    useStore.getState().addDate(id, todayIso(), 'Board meeting');
    expect(await handleRemoteMessage({ text: '/today', from: 'me' })).toContain('Board meeting (Client A)');
  });

  it('unknown commands get the help text', async () => {
    expect(await handleRemoteMessage({ text: '/frobnicate', from: 'me' })).toMatch(/I don't know \/frobnicate/);
  });

  it('linesToDoc keeps paragraphs and bullets apart', () => {
    const doc = linesToDoc(['Intro', '• one', '* two', 'Outro']);
    expect(doc.content?.map((n) => n.type)).toEqual(['paragraph', 'bulletList', 'paragraph']);
  });
});

describe('ics import', () => {
  it('reads a Teams invite', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'SUMMARY:Quarterly review',
      'DTSTART;TZID=GMT Standard Time:20261012T093000',
      'DTEND;TZID=GMT Standard Time:20261012T103000',
      'LOCATION:Microsoft Teams Meeting',
      'ORGANIZER;CN=Stephanie Lee:mailto:steph@example.com',
      'ATTENDEE;CN="Jake Brown";ROLE=REQ-PARTICIPANT:mailto:jake@example.com',
      'ATTENDEE;CN=Matt:mailto:matt@example.com',
      'DESCRIPTION:Agenda:\\n- Numbers\\n- Next steps\\n________________________________\\nMicrosoft Teams meeting\\nJoin',
      ' on your computer',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [ev] = parseIcs(ics);
    expect(ev).toMatchObject({
      id: 'ics:abc-123',
      subject: 'Quarterly review',
      start: '2026-10-12T09:30:00',
      organizer: 'Stephanie Lee',
      attendees: ['Jake Brown', 'Matt'],
      teams: true,
      agenda: 'Agenda:\n- Numbers\n- Next steps',
    });
  });
});
