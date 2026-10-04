import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ACTION_ATTR, ACTION_DONE_AT_ATTR, ACTION_ID_ATTR } from '../lib/actions';
import { uid } from '../lib/util';

const TYPES = ['listItem', 'taskItem'];
const key = new PluginKey('stantonActionPoints');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    actionPoints: {
      /** Star / un-star the list item containing the cursor. */
      toggleActionPoint: () => ReturnType;
      /** Mark the action point containing the cursor done / not done. */
      toggleActionDone: () => ReturnType;
    };
  }
}

type Status = 'open' | 'done' | null;

function statusAttrs(node: PMNode, status: Status) {
  return {
    ...node.attrs,
    [ACTION_ATTR]: status,
    [ACTION_ID_ATTR]: status ? node.attrs[ACTION_ID_ATTR] || uid() : null,
    [ACTION_DONE_AT_ATTR]: status === 'done' ? new Date().toISOString() : null,
  };
}

function setStatus(view: EditorView, pos: number, status: Status) {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !TYPES.includes(node.type.name)) return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, statusAttrs(node, status)));
}

function button(className: string, label: string, title: string, onClick: () => void) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.title = title;
  el.contentEditable = 'false';
  el.tabIndex = -1;
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return el;
}

function buildDecorations(doc: PMNode, editable: () => boolean): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!TYPES.includes(node.type.name)) return true;
    const status = node.attrs[ACTION_ATTR] as Status;
    decos.push(
      Decoration.widget(
        pos + 1,
        (view, getPos) => {
          const wrap = document.createElement('span');
          wrap.className = 'ap-gutter';
          wrap.contentEditable = 'false';
          const itemPos = () => (getPos() ?? 1) - 1;
          wrap.appendChild(
            button(`ap-star${status ? ' is-on' : ''}`, status ? '★' : '☆', status ? 'Remove action point' : 'Make this an action point (Ctrl+Shift+A)', () => {
              if (!editable()) return;
              setStatus(view, itemPos(), status ? null : 'open');
            }),
          );
          if (status) {
            wrap.appendChild(
              button(`ap-check${status === 'done' ? ' is-done' : ''}`, status === 'done' ? '✓' : '', status === 'done' ? 'Mark as not done' : 'Mark as done', () => {
                if (!editable()) return;
                setStatus(view, itemPos(), status === 'done' ? 'open' : 'done');
              }),
            );
          }
          return wrap;
        },
        { side: -1, ignoreSelection: true, key: `ap-${status ?? 'none'}-${node.attrs[ACTION_ID_ATTR] ?? ''}-${pos}`, stopEvent: () => true },
      ),
    );
    return true;
  });
  return DecorationSet.create(doc, decos);
}

export const ActionPoints = Extension.create({
  name: 'actionPoints',

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          [ACTION_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-action'),
            renderHTML: (attrs) => (attrs[ACTION_ATTR] ? { 'data-action': attrs[ACTION_ATTR] } : {}),
          },
          [ACTION_ID_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-action-id'),
            renderHTML: (attrs) => (attrs[ACTION_ID_ATTR] ? { 'data-action-id': attrs[ACTION_ID_ATTR] } : {}),
          },
          [ACTION_DONE_AT_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-action-done-at'),
            renderHTML: (attrs) => (attrs[ACTION_DONE_AT_ATTR] ? { 'data-action-done-at': attrs[ACTION_DONE_AT_ATTR] } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    const findItem = (state: EditorView['state']) => {
      const { $from } = state.selection;
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d);
        if (TYPES.includes(n.type.name)) return { node: n, pos: $from.before(d) };
      }
      return null;
    };
    return {
      toggleActionPoint:
        () =>
        ({ state, tr, dispatch }) => {
          const item = findItem(state);
          if (!item) return false;
          if (dispatch) tr.setNodeMarkup(item.pos, undefined, statusAttrs(item.node, item.node.attrs[ACTION_ATTR] ? null : 'open'));
          return true;
        },
      toggleActionDone:
        () =>
        ({ state, tr, dispatch }) => {
          const item = findItem(state);
          if (!item || !item.node.attrs[ACTION_ATTR]) return false;
          if (dispatch) tr.setNodeMarkup(item.pos, undefined, statusAttrs(item.node, item.node.attrs[ACTION_ATTR] === 'done' ? 'open' : 'done'));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-a': () => this.editor.commands.toggleActionPoint(),
      'Mod-Shift-d': () => this.editor.commands.toggleActionDone(),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => buildDecorations(state.doc, () => editor.isEditable),
          apply: (tr, old, _o, state) => (tr.docChanged ? buildDecorations(state.doc, () => editor.isEditable) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        // Copy/paste can duplicate action ids; give duplicates fresh ids so
        // each action point can be completed independently.
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null;
          const seen = new Set<string>();
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (!TYPES.includes(node.type.name)) return true;
            const id = node.attrs[ACTION_ID_ATTR] as string | null;
            const status = node.attrs[ACTION_ATTR];
            if (status && (!id || seen.has(id))) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, [ACTION_ID_ATTR]: uid() });
              changed = true;
            } else if (id) {
              seen.add(id);
            }
            return true;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
