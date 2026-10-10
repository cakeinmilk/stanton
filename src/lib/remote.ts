/**
 * What happens when you message Stanton on Telegram. Everything new lands in the
 * Scratchpad, ready to be filed later.
 */
import type { JSONContent } from '@tiptap/core';
import { useStore } from '../store';
import { collectActionPoints } from './actions';
import { SCRATCH_PAGE_ID } from './scratch';
import { formatDate, todayIso, uid } from './util';
import type { ActionPoint } from '../types';

export const HELP = [
  'Send me any text and I add it to your Stanton Scratchpad as a note.',
  'The first line becomes the title; lines starting with - or • become bullets.',
  'Photos (with an optional caption) are saved too.',
  '',
  '/todo <text> – add an action point (starred)',
  '/meeting <title> – start a meeting note (more lines become bullets)',
  '/actions – list open action points',
  '/done <number> – tick off an action point from the last /actions list',
  '/today – today’s dates and action points',
  '/dates – important dates for the next 2 weeks',
].join('\n');

let lastList: ActionPoint[] = [];

const para = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const item = (text: string, action?: 'open'): JSONContent => ({
  type: 'listItem',
  attrs: action ? { action, actionId: uid(), actionDoneAt: null } : {},
  content: [para(text)],
});

/** Lines → document: "- x" / "• x" / "* x" become bullets, everything else paragraphs. */
export function linesToDoc(lines: string[], opts: { bullets?: boolean; star?: boolean; image?: string } = {}): JSONContent {
  const content: JSONContent[] = [];
  let list: JSONContent | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);
    if (m || (opts.bullets && line.trim())) {
      if (!list) {
        list = { type: 'bulletList', content: [] };
        content.push(list);
      }
      list.content!.push(item((m ? m[1] : line).trim(), opts.star ? 'open' : undefined));
    } else {
      list = null;
      if (line.trim()) content.push(para(line.trim()));
    }
  }
  if (opts.image) content.push({ type: 'image', attrs: { src: opts.image, alt: 'Photo from Telegram' } });
  if (!content.length) content.push(opts.bullets ? { type: 'bulletList', content: [item('')] } : para(''));
  return { type: 'doc', content };
}

function addScratch(kind: 'note' | 'meeting', title: string, doc: JSONContent) {
  const st = useStore.getState();
  const id = st.addEntry(SCRATCH_PAGE_ID, kind);
  st.updateEntry(id, { title: title.slice(0, 120) });
  st.setEntryContent(id, doc);
  return id;
}

function openActions() {
  const s = useStore.getState();
  return collectActionPoints(s.entries, s.pages, s.projects).filter((a) => a.status === 'open');
}

function projectName(id: string) {
  return id === '__scratch' ? 'Scratchpad' : useStore.getState().projects.find((p) => p.id === id)?.name ?? '';
}

function datesWithin(days: number) {
  const today = todayIso();
  const end = new Date();
  end.setDate(end.getDate() + days);
  const endIso = todayIso(end);
  return useStore
    .getState()
    .projects.filter((p) => !p.archivedAt)
    .flatMap((p) => (p.dates ?? []).map((d) => ({ ...d, project: p.name })))
    .filter((d) => d.date >= today && d.date <= endIso)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function handleRemoteMessage(msg: { text: string; image?: string; from: string }): Promise<string> {
  const text = msg.text.trim();
  const [first, ...rest] = text.split('\n');
  const cmd = /^\/(\w+)(?:@\w+)?\s*(.*)$/s.exec(first ?? '');

  if (cmd) {
    const name = cmd[1].toLowerCase();
    const arg = cmd[2].trim();
    switch (name) {
      case 'start':
      case 'help':
        return HELP;
      case 'todo':
      case 'action': {
        const lines = [arg, ...rest].filter((l) => l.trim());
        if (!lines.length) return 'Usage: /todo Call Jake about thresholds';
        addScratch('note', `To do: ${lines[0]}`, linesToDoc(lines, { bullets: true, star: true }));
        return `⭐ Added ${lines.length} action point${lines.length === 1 ? '' : 's'} to your Scratchpad.`;
      }
      case 'meeting': {
        if (!arg) return 'Usage: /meeting Weekly sync (add bullet lines underneath)';
        addScratch('meeting', arg, linesToDoc(rest, { bullets: true }));
        return `👥 Started “${arg}” in your Scratchpad.`;
      }
      case 'actions': {
        lastList = openActions().slice(0, 30);
        if (!lastList.length) return 'Nothing outstanding 🎉';
        return [
          `Open action points (${lastList.length}):`,
          ...lastList.map((a, i) => `${i + 1}. ${a.text}${projectName(a.projectId) ? ` — ${projectName(a.projectId)}` : ''}`),
          '',
          'Reply /done <number> to tick one off.',
        ].join('\n');
      }
      case 'done': {
        const n = Number(arg);
        const a = lastList[n - 1];
        if (!a) return lastList.length ? `Pick a number from 1 to ${lastList.length}.` : 'Send /actions first, then /done <number>.';
        useStore.getState().setActionStatus(a.entryId, a.id, 'done');
        return `✓ Done: ${a.text}`;
      }
      case 'today': {
        const dates = datesWithin(0);
        const actions = openActions();
        return [
          `📅 ${formatDate(todayIso())}`,
          dates.length ? dates.map((d) => `• ${d.label} (${d.project})`).join('\n') : 'No important dates today.',
          '',
          `⭐ ${actions.length} open action point${actions.length === 1 ? '' : 's'}${actions.length ? ' – /actions to list them' : ''}`,
        ].join('\n');
      }
      case 'dates': {
        const dates = datesWithin(14);
        return dates.length ? ['Next 2 weeks:', ...dates.map((d) => `• ${formatDate(d.date)} – ${d.label} (${d.project})`)].join('\n') : 'No important dates in the next 2 weeks.';
      }
      default:
        return `I don't know /${name}.\n\n${HELP}`;
    }
  }

  // Plain message (or photo) → Scratchpad note.
  const title = (first ?? '').trim().slice(0, 80) || (msg.image ? 'Photo' : 'Note');
  const body = (first ?? '').trim().length > 80 ? [text] : rest;
  addScratch('note', `📱 ${title}`, linesToDoc(body, { image: msg.image }));
  return `🗒 Saved to your Scratchpad${msg.image ? ' (with photo)' : ''}.`;
}
