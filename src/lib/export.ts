import type { JSONContent } from '@tiptap/core';
import { generateHTML } from '@tiptap/core';
import { baseExtensions } from '../editor/extensions';

/** Readable plain text (for email bodies): keeps headings, bullets, numbering and indentation. */
export function docToPlainText(doc: JSONContent): string {
  const out: string[] = [];
  const inline = (n: JSONContent): string =>
    n.type === 'text' ? n.text ?? '' : n.type === 'hardBreak' ? '\n' : (n.content ?? []).map(inline).join('');

  const block = (n: JSONContent, indent: string, marker?: string) => {
    switch (n.type) {
      case 'heading': {
        const text = inline(n);
        out.push('', n.attrs?.level === 2 ? text.toUpperCase() : text);
        return;
      }
      case 'paragraph': {
        const text = inline(n);
        out.push(marker ? `${indent}${marker}${text}` : `${indent}${text}`);
        return;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (n.content ?? []).forEach((li, i) => {
          const m =
            n.type === 'orderedList'
              ? `${(n.attrs?.start ?? 1) + i}. `
              : n.type === 'taskList'
                ? li.attrs?.checked ? '[x] ' : '[ ] '
                : li.attrs?.action ? (li.attrs.action === 'done' ? '✓ ' : '★ ') : '• ';
          (li.content ?? []).forEach((child, j) => block(child, j === 0 ? indent : `${indent}   `, j === 0 ? m : undefined));
        });
        return;
      case 'image':
        out.push(`${indent}[image]`);
        return;
      default:
        (n.content ?? []).forEach((c) => block(c, indent, marker));
    }
  };
  block(doc, '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function docToHtml(doc: JSONContent): string {
  return generateHTML(doc, baseExtensions());
}

export async function copyDoc(doc: JSONContent) {
  const html = docToHtml(doc);
  const text = docToPlainText(doc);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }),
    ]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

export function gmailComposeUrl(subject: string, body: string): string {
  // Very long URLs are rejected by Gmail; trim the body if needed.
  const max = 7000;
  const b = body.length > max ? `${body.slice(0, max)}\n…` : body;
  return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
}
