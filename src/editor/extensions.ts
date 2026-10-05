import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { generateJSON, type JSONContent } from '@tiptap/core';
import { marked } from 'marked';
import { ActionPoints } from './ActionPoints';

/** The document schema shared by every editor (and by HTML/Markdown import). */
export function baseExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: true, autolink: true, linkOnPaste: true } }),
    Image.configure({ allowBase64: true, resize: { enabled: true, minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ActionPoints,
  ];
}

/** Convert Markdown (e.g. from Gemini) into an editor document. */
export function markdownToDoc(md: string): JSONContent {
  const html = (marked.parse(md, { async: false, gfm: true, breaks: false }) as string)
    // Editors only offer two heading sizes: # → H2, ## and smaller → H3.
    .replace(/<(\/?)h([1-6])\b/g, (_m, slash: string, n: string) => `<${slash}h${Math.min(3, Number(n) + 1)}`);
  return generateJSON(html, baseExtensions());
}
