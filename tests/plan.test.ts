import { describe, expect, it } from 'vitest';
import { buildPlanPrompt, defaultWeekStart, fillTemplate, recentEntries } from '../src/lib/plan';
import { normalize, DEFAULT_PLAN_TEMPLATE } from '../src/lib/seed';
import type { Entry, Page, Project } from '../src/types';

const projects: Project[] = [
  { id: 'p1', name: 'Client A', color: '#000', createdAt: '' },
  { id: 'p2', name: 'Old', color: '#000', createdAt: '', archivedAt: 'x' },
];
const pages: Page[] = [
  { id: 'g1', projectId: 'p1', title: 'Status', createdAt: '' },
  { id: 'g2', projectId: 'p2', title: 'Gone', createdAt: '' },
];
const doc = (text: string, action?: string) => ({
  type: 'doc',
  content: [{ type: 'bulletList', content: [{ type: 'listItem', attrs: action ? { action, actionId: text } : {}, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }] }],
});
const e = (id: string, pageId: string, date: string, content: object): Entry => ({ id, pageId, kind: 'meeting', title: id, date, createdAt: '', updatedAt: `${date}T00:00:00Z`, content });
const entries = [e('Kickoff', 'g1', '2026-10-01', doc('Send budget', 'open')), e('Ancient', 'g1', '2026-01-01', doc('Old talk')), e('Hidden', 'g2', '2026-10-02', doc('Secret', 'open'))];
const now = new Date(2026, 9, 5, 9); // Monday

describe('weekly plan', () => {
  it('picks this Monday mid-week and next Monday at the weekend', () => {
    expect(defaultWeekStart(new Date(2026, 9, 7, 10))).toBe('2026-10-05');
    expect(defaultWeekStart(new Date(2026, 9, 5, 9))).toBe('2026-10-05');
    expect(defaultWeekStart(new Date(2026, 9, 4, 9))).toBe('2026-10-05');
    expect(defaultWeekStart(new Date(2026, 9, 9, 15))).toBe('2026-10-12');
  });

  it('fills placeholders', () => {
    expect(fillTemplate('{{week_start}} – {{ week_end }}', '2026-10-05')).toBe('5 Oct 2026 – 9 Oct 2026');
  });

  it('sends notes and actions but no meetings unless chosen', () => {
    const { prompt, stats } = buildPlanPrompt({ projects, pages, entries }, 'T', { weekStart: '2026-10-05', notes: 'Feedback for Stephanie', includeActions: true, includeDone: false, entryIds: [] }, now);
    expect(prompt).toContain('Today is Monday 5 Oct 2026');
    expect(prompt).toContain('Feedback for Stephanie');
    expect(prompt).toContain('- Send budget (project: Client A');
    expect(prompt).not.toContain('Secret');
    expect(prompt).not.toContain('## Meetings and notes');
    expect(stats).toEqual({ actions: 1, entries: 0, notes: true, truncated: false });
  });

  it('adds only the chosen meetings, and can leave out actions', () => {
    const { prompt, stats } = buildPlanPrompt({ projects, pages, entries }, 'T', { weekStart: '2026-10-05', notes: '', includeActions: false, includeDone: false, entryIds: ['Kickoff', 'Hidden'] }, now);
    expect(prompt).toContain('Meeting: Kickoff');
    expect(prompt).not.toContain('Hidden');
    expect(prompt).not.toContain('Open action points');
    expect(stats.entries).toBe(1);
  });

  it('lists recent entries for the picker', () => {
    expect(recentEntries({ projects, pages, entries }, 7, now).map((r) => r.entry.id)).toEqual(['Kickoff']);
  });

  it('upgrades an untouched old default template', () => {
    const old = '# Week of {{week_start}}\n\n## Top 3 priorities\n1.\n2.\n3.\n\n## Monday\n-\n## Tuesday\n-\n## Wednesday\n-\n## Thursday\n-\n## Friday\n-\n\n## Waiting on others\n-\n\n## Carry over / notes\n-';
    expect(normalize({ prefs: { planTemplate: old } }).prefs.planTemplate).toBe(DEFAULT_PLAN_TEMPLATE);
    expect(normalize({ prefs: { planTemplate: 'mine' } }).prefs.planTemplate).toBe('mine');
  });
});
