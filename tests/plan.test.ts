import { describe, expect, it } from 'vitest';
import { buildPlanPrompt, defaultWeekStart, fillTemplate } from '../src/lib/plan';
import type { Entry, Page, Project } from '../src/types';

describe('weekly plan', () => {
  it('picks this Monday mid-week and next Monday at the weekend', () => {
    expect(defaultWeekStart(new Date(2026, 9, 7, 10))).toBe('2026-10-05'); // Wed
    expect(defaultWeekStart(new Date(2026, 9, 5, 9))).toBe('2026-10-05'); // Mon
    expect(defaultWeekStart(new Date(2026, 9, 4, 9))).toBe('2026-10-05'); // Sun
    expect(defaultWeekStart(new Date(2026, 9, 9, 15))).toBe('2026-10-12'); // Fri pm
  });

  it('fills placeholders', () => {
    expect(fillTemplate('{{week_start}} – {{ week_end }}', '2026-10-05')).toBe('5 Oct 2026 – 9 Oct 2026');
  });

  it('includes open actions and recent entries, skipping archived projects', () => {
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
    const { prompt, stats } = buildPlanPrompt(
      { projects, pages, entries: [e('Kickoff', 'g1', '2026-10-01', doc('Send budget', 'open')), e('Ancient', 'g1', '2026-01-01', doc('Old talk')), e('Hidden', 'g2', '2026-10-02', doc('Secret', 'open'))] },
      'T {{week_start}}',
      { weekStart: '2026-10-05', days: 7, includeDone: false },
      new Date(2026, 9, 4),
    );
    expect(prompt).toContain('- Send budget (project: Client A');
    expect(prompt).toContain('T 5 Oct 2026');
    expect(prompt).toContain('Meeting: Kickoff');
    expect(prompt).not.toContain('Ancient');
    expect(prompt).not.toContain('Secret');
    expect(stats).toEqual({ actions: 1, entries: 1, truncated: false });
  });
});
