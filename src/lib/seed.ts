import type { Prefs, StantonData } from '../types';

/** The original (v0.2.0) default, so it can be upgraded to the new one. */
const OLD_DEFAULT_PLAN_TEMPLATE = `# Week of {{week_start}}

## Top 3 priorities
1.
2.
3.

## Monday
-
## Tuesday
-
## Wednesday
-
## Thursday
-
## Friday
-

## Waiting on others
-

## Carry over / notes
-`;

export const DEFAULT_PLAN_TEMPLATE = `## 📅 Your Weekly Plan at a Glance

- **[Day] (Today): [Theme for the day]**
  - **Focus:** [One line on what the day is about.]
  - **Action:** [A specific task. Bold **people's names** and **key items**.]
  - **Action:** [Another task.]
- **[Next day]: [Theme for the day]**
  - **Focus:** [...]
  - **Action:** [...]

(Continue for each working day up to Friday.)`;

export const DEFAULT_PREFS: Prefs = {
  entrySort: 'newest',
  theme: 'system',
  scheme: 'teal',
  aiModel: 'gemini-flash-latest',
  planTemplate: DEFAULT_PLAN_TEMPLATE,
  planDays: 7,
  planIncludeDone: false,
  planIncludeActions: true,
  planNotes: '',
  homeProjectsView: 'cards',
  minimizeToTray: true,
};
import { nowIso, todayIso, uid } from './util';

export function emptyData(): StantonData {
  return { version: 1, projects: [], pages: [], entries: [], prefs: { ...DEFAULT_PREFS } };
}

/** A small welcome project so the first launch isn't a blank screen. */
export function seedData(): StantonData {
  const now = nowIso();
  const projectId = uid();
  const pageId = uid();
  const li = (text: string, action?: 'open' | 'done') => ({
    type: 'listItem',
    attrs: action ? { action, actionId: uid(), actionDoneAt: action === 'done' ? now : null } : {},
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    ...emptyData(),
    projects: [{ id: projectId, name: 'Getting started', color: '#069494', createdAt: now }],
    pages: [{ id: pageId, projectId, title: 'Welcome to Stanton', createdAt: now }],
    entries: [
      {
        id: uid(),
        pageId,
        kind: 'note',
        title: 'How Stanton works',
        date: todayIso(),
        createdAt: now,
        updatedAt: now,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Projects hold pages. Pages hold meetings and notes, sorted by date.' }] },
            {
              type: 'bulletList',
              content: [
                li('Use the dock buttons in the title bar to pin Stanton to the left or right of your screen.'),
                li('Paste or drag images straight into any note.'),
                li('Click the ☆ beside a bullet (or press Ctrl+Shift+A) to turn it into an action point.'),
                li('Archive or delete projects and pages from their ⋯ menus.'),
              ],
            },
          ],
        },
      },
      {
        id: uid(),
        pageId,
        kind: 'meeting',
        title: 'Example kick-off meeting',
        date: todayIso(),
        createdAt: now,
        updatedAt: now,
        content: {
          type: 'doc',
          content: [
            {
              type: 'bulletList',
              content: [
                li('Agreed scope for phase one'),
                li('Send the project plan to the team', 'open'),
                li('Book follow-up meeting for next week', 'open'),
                li('Set up shared folder', 'done'),
              ],
            },
          ],
        },
      },
    ],
  };
}

/** Make sure data loaded from disk has every field we expect. */
export function normalize(raw: unknown): StantonData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<StantonData>;
  return {
    version: 1,
    projects: Array.isArray(r.projects) ? r.projects : [],
    pages: Array.isArray(r.pages) ? r.pages : [],
    entries: Array.isArray(r.entries) ? r.entries : [],
    prefs: upgradePrefs({ ...base.prefs, ...(r.prefs ?? {}) }),
  };
}

function upgradePrefs(prefs: Prefs): Prefs {
  // Users who never edited the old default template get the new layout.
  if (prefs.planTemplate.trim() === OLD_DEFAULT_PLAN_TEMPLATE.trim()) return { ...prefs, planTemplate: DEFAULT_PLAN_TEMPLATE };
  return prefs;
}
