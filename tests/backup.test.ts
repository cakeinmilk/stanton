import { describe, expect, it } from 'vitest';
import { docToMarkdown, parseExport, remapIds } from '../src/lib/backup';
import { collectActionPoints, wholeActionId } from '../src/lib/actions';
import type { Entry, Page, Project } from '../src/types';

const projects: Project[] = [{ id: 'p1', name: 'Client A', color: '#000', createdAt: '', dates: [{ id: 'd1', date: '2026-10-20', label: 'Go-live' }] }];
const pages: Page[] = [{ id: 'g1', projectId: 'p1', title: 'Status', createdAt: '' }];
const entries: Entry[] = [
  {
    id: 'e1',
    pageId: 'g1',
    kind: 'note',
    title: 'Budget review',
    date: '2026-10-01',
    createdAt: '',
    updatedAt: '',
    action: 'open',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Summary' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', attrs: { action: 'open', actionId: 'a1' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Send ', marks: [] }, { type: 'text', text: 'deck', marks: [{ type: 'bold' }] }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }] }] },
          ],
        },
      ],
    },
  },
];

describe('whole-note action points', () => {
  it('are collected with the entry title and flagged as whole', () => {
    const all = collectActionPoints(entries, pages, projects);
    expect(all[0]).toMatchObject({ id: wholeActionId('e1'), text: 'Budget review', whole: true, status: 'open' });
    expect(all).toHaveLength(2);
  });
});

describe('export / import', () => {
  it('writes readable markdown with stars and nesting', () => {
    expect(docToMarkdown(entries[0].content)).toBe('### Summary\n\n- ★ Send **deck**\n- Parent\n  - Child\n');
  });

  it('remaps every id but keeps the links, and renames clashing projects', () => {
    const out = remapIds({ projects, pages, entries }, new Set(['Client A']));
    expect(out.projects[0].id).not.toBe('p1');
    expect(out.projects[0].name).toBe('Client A (imported)');
    expect(out.projects[0].dates?.[0].label).toBe('Go-live');
    expect(out.pages[0].projectId).toBe(out.projects[0].id);
    expect(out.entries[0].pageId).toBe(out.pages[0].id);
  });

  it('accepts exports and raw data files, rejects other JSON', () => {
    expect(parseExport(JSON.stringify({ format: 'stanton-export', version: 1, projects: [], pages: [], entries: [] })).format).toBe('stanton-export');
    expect(parseExport(JSON.stringify({ version: 1, projects: [], pages: [], entries: [], prefs: {} })).scope).toBe('all');
    expect(() => parseExport('{"hello":1}')).toThrow(/isn't a Stanton backup/);
    expect(() => parseExport('nope')).toThrow(/valid JSON/);
  });
});
