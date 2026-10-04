import { describe, expect, it } from 'vitest';
import { collectActionPoints, extractActions, nodeText, setActionStatusInContent } from '../src/lib/actions';
import type { Entry, Page, Project } from '../src/types';

const li = (text: string, attrs: Record<string, unknown> = {}, nested?: unknown[]) => ({
  type: 'listItem',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...(nested ? [{ type: 'bulletList', content: nested }] : [])],
});

const doc = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        li('Plain point'),
        li('Do the thing', { action: 'open', actionId: 'a1' }, [li('Sub detail'), li('Nested action', { action: 'done', actionId: 'a2', actionDoneAt: '2026-01-02T00:00:00Z' })]),
      ],
    },
  ],
};

describe('action points', () => {
  it('extracts starred items without nested text', () => {
    expect(extractActions(doc)).toEqual([
      { id: 'a1', text: 'Do the thing', status: 'open', completedAt: null },
      { id: 'a2', text: 'Nested action', status: 'done', completedAt: '2026-01-02T00:00:00Z' },
    ]);
  });

  it('includes nested text for search', () => {
    expect(nodeText(doc, true)).toContain('Sub detail');
  });

  it('updates status immutably', () => {
    const { content, changed } = setActionStatusInContent(doc, 'a1', 'done', 'T');
    expect(changed).toBe(true);
    expect(extractActions(content)[0]).toMatchObject({ id: 'a1', status: 'done', completedAt: 'T' });
    expect(extractActions(doc)[0].status).toBe('open');
    expect(setActionStatusInContent(doc, 'missing', 'done', 'T').changed).toBe(false);
  });

  it('collects across projects and skips archived', () => {
    const projects: Project[] = [
      { id: 'p1', name: 'One', color: '#000', createdAt: '' },
      { id: 'p2', name: 'Two', color: '#000', createdAt: '', archivedAt: '2026-01-01' },
    ];
    const pages: Page[] = [
      { id: 'g1', projectId: 'p1', title: 'A', createdAt: '' },
      { id: 'g2', projectId: 'p2', title: 'B', createdAt: '' },
    ];
    const entry = (id: string, pageId: string, date: string): Entry => ({ id, pageId, kind: 'meeting', title: id, date, createdAt: '', updatedAt: '', content: doc });
    const all = collectActionPoints([entry('e2', 'g1', '2026-02-01'), entry('e1', 'g1', '2026-01-01'), entry('e3', 'g2', '2026-01-01')], pages, projects);
    expect(all.map((a) => `${a.entryId}:${a.id}`)).toEqual(['e1:a1', 'e1:a2', 'e2:a1', 'e2:a2']);
    expect(all.every((a) => a.projectId === 'p1')).toBe(true);
  });
});
