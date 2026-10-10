import type { Entry, Page, Project, StantonData } from '../types';
import { collectActionPoints, nodeText } from './actions';
import { formatDate, todayIso } from './util';
import { isLivePage, SCRATCH_PROJECT } from './scratch';

/** Monday of the week to plan: this week's Monday, or next Monday from Friday afternoon / weekends. */
export function defaultWeekStart(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 = Sun
  const planNextWeek = day === 0 || day === 6 || (day === 5 && now.getHours() >= 12);
  const diff = planNextWeek ? (8 - day) % 7 || 7 : 1 - day;
  d.setDate(d.getDate() + diff);
  return todayIso(d);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayIso(new Date(y, m - 1, d + n));
}

export function fillTemplate(template: string, weekStart: string, now = new Date()): string {
  return template
    .replace(/\{\{\s*week_start\s*\}\}/g, formatDate(weekStart))
    .replace(/\{\{\s*week_end\s*\}\}/g, formatDate(addDays(weekStart, 4)))
    .replace(/\{\{\s*today\s*\}\}/g, formatDate(todayIso(now)));
}

const MAX_ENTRY_CHARS = 4000;
const MAX_TOTAL_CHARS = 60000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface PlanInput {
  weekStart: string;
  /** The user's own notes for the week (the main input). */
  notes: string;
  includeActions: boolean;
  includeDone: boolean;
  /** Meetings/notes the user chose to add. None by default. */
  entryIds: string[];
  /** How far back "recently completed" looks. */
  days?: number;
}

export interface PlanPrompt {
  system: string;
  prompt: string;
  stats: { actions: number; entries: number; notes: boolean; truncated: boolean };
}

export const PLAN_SYSTEM = [
  'You turn a person\'s notes, action points and meeting notes into a clear weekly plan.',
  "Lay the plan out exactly like the user's template: same heading, same nesting, same bold labels and the same style of wording.",
  'Square-bracketed text in the template describes what to write there; replace it, never copy it.',
  'Write one top-level bullet per working day (Monday to Friday). If the week has already started, begin with today and mark it "(Today)".',
  'Give each day a short theme, a one-line Focus, then specific Action bullets.',
  "Bold people's names and the names of key projects, reports and deliverables.",
  'Respect any days, deadlines and dependencies mentioned (e.g. "deliver by Wednesday"), and order work so blockers are cleared first.',
  'Use only the information provided. Do not invent tasks, people or deadlines.',
  'Reply with the finished plan in Markdown only, with no preamble or closing remarks.',
].join(' ');

/** Meetings and notes the user can pick from, newest first. */
export function recentEntries(data: Pick<StantonData, 'projects' | 'pages' | 'entries'>, days: number, now = new Date()) {
  const since = addDays(todayIso(now), -Math.max(0, days));
  const liveProjects = new Map([...data.projects.filter((p) => !p.archivedAt), SCRATCH_PROJECT].map((p) => [p.id, p]));
  const livePages = new Map(data.pages.filter((p) => isLivePage(p, new Set(liveProjects.keys()))).map((p) => [p.id, p]));
  return data.entries
    .filter((e) => livePages.has(e.pageId) && (e.date >= since || e.updatedAt.slice(0, 10) >= since))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
    .map((e) => {
      const page = livePages.get(e.pageId)!;
      return { entry: e, page, project: liveProjects.get(page.projectId)! };
    });
}

export function buildPlanPrompt(data: Pick<StantonData, 'projects' | 'pages' | 'entries'>, template: string, input: PlanInput, now = new Date()): PlanPrompt {
  const projects = data.projects.filter((p: Project) => !p.archivedAt);
  const projectIds = new Set(projects.map((p) => p.id));
  const pages = data.pages.filter((p) => isLivePage(p, projectIds));
  const pageById = new Map<string, Page>(pages.map((p) => [p.id, p]));
  const projectById = new Map([...projects, SCRATCH_PROJECT].map((p) => [p.id, p]));
  const since = addDays(todayIso(now), -Math.max(0, input.days ?? 7));

  const actions = input.includeActions
    ? collectActionPoints(data.entries, pages, projects).filter(
        (a) => a.status === 'open' || (input.includeDone && (a.completedAt ?? '').slice(0, 10) >= since),
      )
    : [];

  const chosen = new Set(input.entryIds);
  const entries: Entry[] = data.entries.filter((e) => chosen.has(e.id) && pageById.has(e.pageId)).sort((a, b) => a.date.localeCompare(b.date));

  const lines: string[] = [];
  lines.push(`Today is ${DAY_NAMES[now.getDay()]} ${formatDate(todayIso(now))}. Plan the week starting Monday ${formatDate(input.weekStart)}.`, '');
  lines.push('## Template (follow this layout)', '', fillTemplate(template, input.weekStart, now), '');

  const notes = input.notes.trim();
  lines.push('## My notes for this week', notes || '(none)');

  if (input.includeActions) {
    lines.push('', '## Open action points');
    const open = actions.filter((a) => a.status === 'open');
    if (!open.length) lines.push('(none)');
    for (const a of open) {
      const project = projectById.get(a.projectId)?.name ?? '';
      lines.push(`- ${a.text} (project: ${project}; from ${a.entryKind} "${a.entryTitle || 'Untitled'}" on ${formatDate(a.entryDate)})`);
    }
    if (input.includeDone) {
      lines.push('', '## Recently completed action points');
      const done = actions.filter((a) => a.status === 'done');
      if (!done.length) lines.push('(none)');
      for (const a of done) lines.push(`- ${a.text} (project: ${projectById.get(a.projectId)?.name ?? ''})`);
    }
  }

  let truncated = false;
  let included = 0;
  if (entries.length) {
    lines.push('', '## Meetings and notes');
    let total = lines.join('\n').length;
    for (const e of entries) {
      const page = pageById.get(e.pageId)!;
      const project = projectById.get(page.projectId)!;
      let text = nodeText(e.content, true);
      if (text.length > MAX_ENTRY_CHARS) {
        text = `${text.slice(0, MAX_ENTRY_CHARS)}…`;
        truncated = true;
      }
      const block = `\n### ${e.kind === 'meeting' ? 'Meeting' : 'Note'}: ${e.title || 'Untitled'} — ${formatDate(e.date)} (${project.name} › ${page.title})\n${text || '(empty)'}`;
      if (total + block.length > MAX_TOTAL_CHARS) {
        truncated = true;
        break;
      }
      lines.push(block);
      total += block.length;
      included++;
    }
  }

  return {
    system: PLAN_SYSTEM,
    prompt: lines.join('\n'),
    stats: { actions: actions.length, entries: included, notes: !!notes, truncated },
  };
}
