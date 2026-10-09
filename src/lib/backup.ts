import type { JSONContent } from '@tiptap/core';
import type { Entry, Page, Project, StantonData } from '../types';
import { useStore } from '../store';
import { bridge } from './platform';
import { collectActionPoints, extractActions } from './actions';
import { docToHtml } from './export';
import { formatDate, nowIso, uid } from './util';

/** File format for Stanton backups / transfers. Images are embedded as data URLs. */
export interface StantonExport {
  format: 'stanton-export';
  version: 1;
  exportedAt: string;
  scope: 'all' | 'project';
  projects: Project[];
  pages: Page[];
  entries: Entry[];
  prefs?: StantonData['prefs'];
}

const JSON_FILTER = [{ name: 'Stanton backup', extensions: ['stanton', 'json'] }];

// ---------- images ----------

async function toDataUrl(src: string): Promise<string> {
  if (!src.startsWith('stanton:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { bytes, mime };
}

/** Return a copy of `doc` with every image src passed through `fn` (memoised per src). */
async function mapImages(doc: JSONContent, fn: (src: string) => Promise<string>, cache = new Map<string, Promise<string>>()): Promise<JSONContent> {
  const next: JSONContent = { ...doc };
  if (doc.type === 'image' && typeof doc.attrs?.src === 'string') {
    const src = doc.attrs.src as string;
    if (!cache.has(src)) cache.set(src, fn(src).catch(() => src));
    next.attrs = { ...doc.attrs, src: await cache.get(src)! };
  }
  if (doc.content) next.content = await Promise.all(doc.content.map((c) => mapImages(c, fn, cache)));
  return next;
}

// ---------- building ----------

function select(projectId?: string) {
  const s = useStore.getState();
  const projects = projectId ? s.projects.filter((p) => p.id === projectId) : s.projects;
  const ids = new Set(projects.map((p) => p.id));
  const pages = s.pages.filter((p) => ids.has(p.projectId));
  const pageIds = new Set(pages.map((p) => p.id));
  const entries = s.entries.filter((e) => pageIds.has(e.pageId));
  return { projects, pages, entries, prefs: s.prefs };
}

export async function buildExport(projectId?: string): Promise<StantonExport> {
  const { projects, pages, entries, prefs } = select(projectId);
  const cache = new Map<string, Promise<string>>();
  return {
    format: 'stanton-export',
    version: 1,
    exportedAt: nowIso(),
    scope: projectId ? 'project' : 'all',
    projects,
    pages,
    entries: await Promise.all(entries.map(async (e) => ({ ...e, content: await mapImages(e.content, toDataUrl, cache) }))),
    ...(projectId ? {} : { prefs: { ...prefs, planNotes: '' } }),
  };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 60) || 'Stanton';
const stamp = () => new Date().toISOString().slice(0, 10);

function fileBase(projectId?: string) {
  const p = projectId ? useStore.getState().projects.find((x) => x.id === projectId) : null;
  return p ? `${safeName(p.name)} ${stamp()}` : `Stanton backup ${stamp()}`;
}

export async function exportStanton(projectId?: string) {
  const data = await buildExport(projectId);
  return bridge.saveFile(`${fileBase(projectId)}.stanton`, JSON.stringify(data, null, 1), JSON_FILTER);
}

// ---------- HTML ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function buildHtml(projectId?: string): Promise<string> {
  const data = await buildExport(projectId);
  const live = data.projects.filter((p) => !p.archivedAt);
  const actions = collectActionPoints(data.entries, data.pages, data.projects);
  const parts: string[] = [];
  for (const project of live) {
    parts.push(`<section class="project" style="--c:${esc(project.color)}"><h1>${esc(project.name)}</h1>`);
    const dates = [...(project.dates ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    if (dates.length) {
      parts.push('<h3>Important dates</h3><ul>');
      for (const d of dates) parts.push(`<li><b>${esc(formatDate(d.date))}</b> – ${esc(d.label)}</li>`);
      parts.push('</ul>');
    }
    const open = actions.filter((a) => a.projectId === project.id && a.status === 'open');
    if (open.length) {
      parts.push('<h3>Open action points</h3><ul class="actions">');
      for (const a of open) parts.push(`<li>★ ${esc(a.text)} <small>(${esc(a.entryTitle || 'Untitled')}, ${esc(formatDate(a.entryDate))})</small></li>`);
      parts.push('</ul>');
    }
    for (const page of data.pages.filter((p) => p.projectId === project.id && !p.archivedAt)) {
      parts.push(`<h2>${esc(page.title)}</h2>`);
      const entries = data.entries.filter((e) => e.pageId === page.id).sort((a, b) => b.date.localeCompare(a.date));
      for (const e of entries) {
        const title = `${e.kind === 'meeting' ? `${formatDate(e.date)} · ` : ''}${e.title || (e.kind === 'meeting' ? 'Untitled meeting' : 'Untitled note')}`;
        const flag = e.action ? ` <span class="flag">${e.action === 'done' ? '✓ done' : '⚑ action'}</span>` : '';
        parts.push(`<article class="${e.kind}"><h3>${esc(title)}${flag}</h3>${docToHtml(e.content)}</article>`);
      }
    }
    parts.push('</section>');
  }
  const title = projectId ? live[0]?.name ?? 'Stanton' : 'Stanton notes';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="generator" content="Stanton">
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1b2b2b;line-height:1.5}
h1{border-bottom:4px solid var(--c,#069494);padding-bottom:4px}
h2{margin-top:32px;color:var(--c,#069494)}
article{border-left:4px solid var(--c,#069494);padding:2px 14px;margin:14px 0;background:#fafcfc}
article.note{border-left-style:dashed}
.flag{font-size:12px;background:#fff1b8;padding:1px 6px;border-radius:4px}
li[data-action=open]>p::before{content:'★ ';color:#e0a800}
li[data-action=done]>p{text-decoration:line-through;color:#888}
li[data-action=done]>p::before{content:'✓ '}
img{max-width:100%;height:auto}
small{color:#667}
</style></head><body>
<p><small>Exported from Stanton on ${esc(formatDate(stamp()))}</small></p>
${parts.join('\n')}
</body></html>`;
}

export async function exportHtml(projectId?: string) {
  return bridge.saveFile(`${fileBase(projectId)}.html`, await buildHtml(projectId), [{ name: 'Web page', extensions: ['html'] }]);
}

// ---------- Markdown ----------

function inlineMd(n: JSONContent): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') return `![${n.attrs?.alt ?? ''}](${n.attrs?.src ?? ''})`;
  if (n.type !== 'text') return (n.content ?? []).map(inlineMd).join('');
  let t = (n.text ?? '').replace(/([*_`[\]])/g, '\\$1');
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') t = `**${t}**`;
    else if (m.type === 'italic') t = `*${t}*`;
    else if (m.type === 'strike') t = `~~${t}~~`;
    else if (m.type === 'code') t = `\`${n.text}\``;
    else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`;
  }
  return t;
}

export function docToMarkdown(doc: JSONContent, indent = ''): string {
  const out: string[] = [];
  for (const n of doc.content ?? []) {
    switch (n.type) {
      case 'heading':
        out.push(`${'#'.repeat(Math.min(6, (n.attrs?.level ?? 2) + 1))} ${inlineMd(n)}`, '');
        break;
      case 'paragraph':
        out.push(indent + inlineMd(n), '');
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        (n.content ?? []).forEach((li, i) => {
          const marker = n.type === 'orderedList' ? `${(n.attrs?.start ?? 1) + i}.` : n.type === 'taskList' ? `- [${li.attrs?.checked ? 'x' : ' '}]` : '-';
          const star = li.attrs?.action === 'open' ? '★ ' : li.attrs?.action === 'done' ? '✓ ' : '';
          const [first, ...rest] = li.content ?? [];
          out.push(`${indent}${marker} ${star}${first ? inlineMd(first) : ''}`);
          for (const child of rest) {
            const sub = docToMarkdown({ type: 'doc', content: [child] }, indent + '  ').replace(/\n+$/, '');
            if (sub) out.push(sub);
          }
        });
        out.push('');
        break;
      }
      case 'blockquote':
        out.push(docToMarkdown(n, indent).trimEnd().split('\n').map((l) => `> ${l}`).join('\n'), '');
        break;
      case 'codeBlock':
        out.push('```', (n.content ?? []).map((c) => c.text ?? '').join(''), '```', '');
        break;
      case 'horizontalRule':
        out.push('---', '');
        break;
      case 'image':
        out.push(inlineMd(n), '');
        break;
      default:
        if (n.content) out.push(docToMarkdown(n, indent));
    }
  }
  return out.join('\n');
}

export async function buildMarkdown(projectId?: string): Promise<string> {
  const data = await buildExport(projectId);
  const out: string[] = [];
  for (const project of data.projects.filter((p) => !p.archivedAt)) {
    out.push(`# ${project.name}`, '');
    for (const d of [...(project.dates ?? [])].sort((a, b) => a.date.localeCompare(b.date))) out.push(`- 📅 **${formatDate(d.date)}** – ${d.label}`);
    if (project.dates?.length) out.push('');
    for (const page of data.pages.filter((p) => p.projectId === project.id && !p.archivedAt)) {
      out.push(`## ${page.title}`, '');
      for (const e of data.entries.filter((x) => x.pageId === page.id).sort((a, b) => b.date.localeCompare(a.date))) {
        const flag = e.action === 'open' ? ' ⚑' : e.action === 'done' ? ' ✓' : '';
        out.push(`### ${e.kind === 'meeting' ? `${formatDate(e.date)} · ` : ''}${e.title || `Untitled ${e.kind}`}${flag}`, '', docToMarkdown(e.content).trim(), '');
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export async function exportMarkdown(projectId?: string) {
  return bridge.saveFile(`${fileBase(projectId)}.md`, await buildMarkdown(projectId), [{ name: 'Markdown', extensions: ['md'] }]);
}

// ---------- import ----------

export function parseExport(text: string): StantonExport {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Stanton backup (it isn't valid JSON).");
  }
  // A raw data file (stanton.json from the data folder) is accepted too.
  if (raw && raw.format !== 'stanton-export' && Array.isArray(raw.projects) && Array.isArray(raw.pages) && Array.isArray(raw.entries)) {
    raw = { format: 'stanton-export', version: 1, exportedAt: '', scope: 'all', ...raw };
  }
  if (!raw || raw.format !== 'stanton-export' || !Array.isArray(raw.projects) || !Array.isArray(raw.pages) || !Array.isArray(raw.entries)) {
    throw new Error("That file isn't a Stanton backup.");
  }
  return raw as StantonExport;
}

/**
 * Give everything fresh ids (so importing twice, or into the same Stanton, never clashes)
 * and keep the links between projects, pages and entries.
 */
export function remapIds(data: Pick<StantonExport, 'projects' | 'pages' | 'entries'>, existingNames: Set<string>) {
  const projectMap = new Map<string, string>();
  const pageMap = new Map<string, string>();
  const projects = data.projects.map((p) => {
    const id = uid();
    projectMap.set(p.id, id);
    const name = existingNames.has(p.name) ? `${p.name} (imported)` : p.name;
    return { ...p, id, name, dates: (p.dates ?? []).map((d) => ({ ...d, id: uid() })) };
  });
  const pages = data.pages
    .filter((p) => projectMap.has(p.projectId))
    .map((p) => {
      const id = uid();
      pageMap.set(p.id, id);
      return { ...p, id, projectId: projectMap.get(p.projectId)! };
    });
  const entries = data.entries.filter((e) => pageMap.has(e.pageId)).map((e) => ({ ...e, id: uid(), pageId: pageMap.get(e.pageId)! }));
  return { projects, pages, entries };
}

export async function importStanton(): Promise<{ projects: number; pages: number; entries: number; actions: number } | null> {
  const file = await bridge.openFile(JSON_FILTER);
  if (!file) return null;
  const data = parseExport(file.content);
  const st = useStore.getState();
  const mapped = remapIds(data, new Set(st.projects.map((p) => p.name)));
  // Store embedded images in Stanton's own image folder.
  const cache = new Map<string, Promise<string>>();
  const saveImage = async (src: string) => {
    if (!src.startsWith('data:')) return src;
    const parsed = dataUrlToBytes(src);
    return parsed ? bridge.saveImage(parsed.bytes, parsed.mime) : src;
  };
  const entries = await Promise.all(mapped.entries.map(async (e) => ({ ...e, content: await mapImages(e.content, saveImage, cache) })));
  st.importData({ ...mapped, entries });
  return {
    projects: mapped.projects.length,
    pages: mapped.pages.length,
    entries: entries.length,
    actions: entries.reduce((n, e) => n + extractActions(e.content).length + (e.action ? 1 : 0), 0),
  };
}
