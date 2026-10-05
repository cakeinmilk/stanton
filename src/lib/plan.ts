import type { Entry, Page, Project, StantonData } from '../types';
import { collectActionPoints, nodeText } from './actions';
import { formatDate, todayIso } from './util';

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

export interface PlanInput {
  weekStart: string;
  days: number;
  includeDone: boolean;
  projectIds?: string[];
}

export interface PlanPrompt {
  system: string;
  prompt: string;
  stats: { actions: number; entries: number; truncated: boolean };
}

export const PLAN_SYSTEM = [
  'You turn meeting notes and action points into a weekly plan.',
  "Follow the user's template exactly: keep its headings, their order and its formatting, and fill it in.",
  'Use only the information provided. Do not invent tasks, people or deadlines.',
  'Spread open action points across the days sensibly, putting overdue or urgent-sounding items first.',
  'Mention which project each item belongs to in brackets, e.g. "Send budget (Client A)".',
  'Reply with the finished plan in Markdown only, with no preamble or closing remarks.',
].join(' ');

export function buildPlanPrompt(data: Pick<StantonData, 'projects' | 'pages' | 'entries'>, template: string, input: PlanInput, now = new Date()): PlanPrompt {
  const live = (p: Project) => !p.archivedAt && (!input.projectIds || input.projectIds.includes(p.id));
  const projects = data.projects.filter(live);
  const projectIds = new Set(projects.map((p) => p.id));
  const pages = data.pages.filter((p) => !p.archivedAt && projectIds.has(p.projectId));
  const pageById = new Map<string, Page>(pages.map((p) => [p.id, p]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const since = addDays(todayIso(now), -Math.max(0, input.days));

  const actions = collectActionPoints(data.entries, pages, projects).filter(
    (a) => a.status === 'open' || (input.includeDone && (a.completedAt ?? '').slice(0, 10) >= since),
  );

  const recent: Entry[] = data.entries
    .filter((e) => pageById.has(e.pageId) && (e.date >= since || e.updatedAt.slice(0, 10) >= since))
    .sort((a, b) => a.date.localeCompare(b.date));

  const lines: string[] = [];
  lines.push(`Today is ${formatDate(todayIso(now))}. Plan the week starting Monday ${formatDate(input.weekStart)}.`, '');
  lines.push('## Template to fill in', '', fillTemplate(template, input.weekStart, now), '');

  lines.push('## Open action points');
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

  lines.push('', `## Meetings and notes from the last ${input.days} days`);
  let total = lines.join('\n').length;
  let truncated = false;
  let included = 0;
  for (const e of recent) {
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
  if (!recent.length) lines.push('(none)');

  return { system: PLAN_SYSTEM, prompt: lines.join('\n'), stats: { actions: actions.length, entries: included, truncated } };
}
