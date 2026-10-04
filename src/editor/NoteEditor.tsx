import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import type { EditorView } from '@tiptap/pm/view';
import { Selection } from '@tiptap/pm/state';
import { ActionPoints } from './ActionPoints';
import { bridge } from '../lib/platform';

export interface NoteEditorProps {
  content: JSONContent;
  placeholder: string;
  /** Changes when content was modified outside the editor (e.g. action completed on Home). */
  externalRev: number;
  onChange: (content: JSONContent) => void;
  autoFocus?: boolean;
}

async function insertImageFiles(view: EditorView, files: File[], pos?: number) {
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await bridge.saveImage(bytes, file.type || 'image/png');
    const { schema } = view.state;
    const node = schema.nodes.image.create({ src, alt: file.name || 'Pasted image' });
    const tr = view.state.tr;
    if (pos != null) tr.insert(Math.min(pos, tr.doc.content.size), node);
    else tr.replaceSelectionWith(node);
    // Put the cursor after the image (adding a paragraph if needed) so the
    // next keystroke or paste doesn't replace it.
    let after = -1;
    tr.doc.descendants((n, p) => {
      if (n.type.name === 'image' && n.attrs.src === src) after = p + n.nodeSize;
      return after < 0;
    });
    if (after >= 0) {
      const $a = tr.doc.resolve(after);
      if (!$a.nodeAfter || !$a.nodeAfter.isTextblock) {
        if ($a.parent.canReplaceWith($a.index(), $a.index(), schema.nodes.paragraph)) tr.insert(after, schema.nodes.paragraph.create());
      }
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size)), 1));
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }
}

const imageFiles = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));

export function NoteEditor({ content, placeholder, externalRev, onChange, autoFocus }: NoteEditorProps) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<JSONContent | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [focused, setFocused] = useState(false);

  const flush = () => {
    clearTimeout(timer.current);
    if (latest.current) {
      onChangeRef.current(latest.current);
      latest.current = null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: true, autolink: true, linkOnPaste: true } }),
      Image.configure({ allowBase64: true, resize: { enabled: true, minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true } }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ActionPoints,
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'note-content', spellcheck: 'true' },
      handlePaste(view, event) {
        const files = imageFiles(event.clipboardData?.files);
        // If HTML is present (e.g. copied from a web page) let TipTap handle it, it carries the image src.
        if (!files.length || event.clipboardData?.getData('text/html')) return false;
        event.preventDefault();
        void insertImageFiles(view, files);
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertImageFiles(view, files, coords?.pos);
        return true;
      },
    },
    onUpdate({ editor }) {
      latest.current = editor.getJSON();
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      flush();
    },
  });

  // Save any pending edits when the editor goes away.
  useEffect(() => () => flush(), []);

  // Reload when the stored content was changed elsewhere.
  const firstRev = useRef(externalRev);
  useEffect(() => {
    if (!editor || externalRev === firstRev.current) return;
    firstRev.current = externalRev;
    flush();
    const { from, to } = editor.state.selection;
    editor.commands.setContent(content, { emitUpdate: false });
    try {
      editor.commands.setTextSelection({ from: Math.min(from, editor.state.doc.content.size), to: Math.min(to, editor.state.doc.content.size) });
    } catch {
      /* selection no longer valid */
    }
  }, [externalRev, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`note-editor${focused ? ' is-focused' : ''}`}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      inItem: e.isActive('listItem') || e.isActive('taskItem'),
      starred: !!(e.getAttributes('listItem').action || e.getAttributes('taskItem').action),
    }),
  });
  const fileInput = useRef<HTMLInputElement>(null);

  const B = ({ on, label, title, run, disabled }: { on?: boolean; label: string; title: string; run: () => void; disabled?: boolean }) => (
    <button
      type="button"
      className={`tb-btn${on ? ' is-on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {label}
    </button>
  );

  const chain = () => editor.chain().focus();

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <B on={state.bold} label="B" title="Bold (Ctrl+B)" run={() => chain().toggleBold().run()} />
      <B on={state.italic} label="I" title="Italic (Ctrl+I)" run={() => chain().toggleItalic().run()} />
      <B on={state.underline} label="U" title="Underline (Ctrl+U)" run={() => chain().toggleUnderline().run()} />
      <B on={state.strike} label="S" title="Strikethrough" run={() => chain().toggleStrike().run()} />
      <span className="tb-sep" />
      <B on={state.h2} label="H" title="Heading" run={() => chain().toggleHeading({ level: 2 }).run()} />
      <B on={state.bullet} label="•" title="Bullet list" run={() => chain().toggleBulletList().run()} />
      <B on={state.ordered} label="1." title="Numbered list" run={() => chain().toggleOrderedList().run()} />
      <B on={state.task} label="☑" title="Checklist" run={() => chain().toggleTaskList().run()} />
      <span className="tb-sep" />
      <B on={state.starred} label="★" title="Action point (Ctrl+Shift+A)" disabled={!state.inItem} run={() => chain().toggleActionPoint().run()} />
      <B label="🖼" title="Insert image" run={() => fileInput.current?.click()} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = '';
          if (files.length) void insertImageFiles(editor.view, files);
        }}
      />
    </div>
  );
}
