import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
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
