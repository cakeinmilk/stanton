import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** An item that expands in place to show more items (keeps long lists like "Move to" tucked away). */
export interface SubMenu {
  label: string;
  icon?: ReactNode;
  submenu: MenuEntry[];
  disabled?: boolean;
}

export type MenuEntry = MenuItem | SubMenu | 'separator';

const isSub = (e: MenuEntry): e is SubMenu => typeof e === 'object' && 'submenu' in e;

type Anchor = { kind: 'rect'; rect: DOMRect } | { kind: 'point'; x: number; y: number };

/** A popover menu positioned next to a button or at the mouse pointer, kept on screen. */
function MenuPopover({ items, anchor, onClose, ignore }: { items: MenuEntry[]; anchor: Anchor; onClose: () => void; ignore?: HTMLElement | null }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [open, setOpen] = useState<Record<number, boolean>>({});

  useLayoutEffect(() => {
    if (!menu.current) return;
    const m = menu.current.getBoundingClientRect();
    let left: number;
    let top: number;
    if (anchor.kind === 'rect') {
      const r = anchor.rect;
      left = r.right - m.width;
      if (left < 8) left = Math.min(r.left, window.innerWidth - m.width - 8);
      top = r.bottom + 4;
      if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    } else {
      left = Math.min(anchor.x, window.innerWidth - m.width - 8);
      top = anchor.y + m.height > window.innerHeight - 8 ? Math.max(8, anchor.y - m.height) : anchor.y;
    }
    setPos({ top, left: Math.max(8, left) });
  }, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a sub-list expands, nudge the menu up if it would run off the bottom.
  useLayoutEffect(() => {
    if (!menu.current) return;
    const m = menu.current.getBoundingClientRect();
    if (m.bottom > window.innerHeight - 8) setPos((p) => ({ ...p, top: Math.max(8, window.innerHeight - 8 - m.height) }));
  }, [open]);

  const renderItems = (list: MenuEntry[], depth: number, prefix: string): ReactNode =>
    list.map((item, i) => {
      const key = `${prefix}${i}`;
      if (item === 'separator') return <div key={key} className="menu-sep" />;
      if (isSub(item)) {
        const idx = depth * 1000 + i;
        const expanded = !!open[idx];
        return (
          <div key={key} className="menu-group">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={expanded}
              className={`menu-item has-sub${expanded ? ' is-open' : ''}`}
              disabled={item.disabled || !item.submenu.length}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => ({ ...o, [idx]: !o[idx] }));
              }}
            >
              <span className="menu-icon">{item.icon ?? ''}</span>
              {item.label}
              <span className="menu-caret">{expanded ? '▾' : '▸'}</span>
            </button>
            {expanded && <div className="menu-sublist">{renderItems(item.submenu, depth + 1, `${key}-`)}</div>}
          </div>
        );
      }
      return (
        <button
          key={key}
          type="button"
          role="menuitem"
          className={`menu-item${item.danger ? ' danger' : ''}`}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            item.onSelect();
          }}
        >
          <span className="menu-icon">{item.icon ?? ''}</span>
          {item.label}
        </button>
      );
    });

  useEffect(() => {
    const close = (e: Event) => {
      if (menu.current?.contains(e.target as Node) || ignore?.contains(e.target as Node)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    menu.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, ignore]);

  return createPortal(
    <div
      ref={menu}
      className="menu"
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}
    >
      {renderItems(items, 0, '')}
    </div>,
    document.body,
  );
}

/** A "⋯" button that opens a small popover menu. */
export function MenuButton({ items, label = 'More actions', className = '', children }: { items: MenuEntry[]; label?: string; className?: string; children?: ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setAnchor(null), []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`icon-btn ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor((a) => (a ? null : { kind: 'rect', rect: e.currentTarget.getBoundingClientRect() }));
        }}
      >
        {children ?? '⋯'}
      </button>
      {anchor && <MenuPopover items={items} anchor={anchor} ignore={btn.current} onClose={close} />}
    </>
  );
}

// ---- Right-click menus ----

const useContextMenuState = create<{ items: MenuEntry[]; x: number; y: number; open: boolean }>(() => ({ items: [], x: 0, y: 0, open: false }));

/**
 * Returns an onContextMenu handler that shows `items` at the pointer.
 * `items` is a function so the menu reflects the latest state when opened.
 */
export function contextMenu(items: () => MenuEntry[]) {
  return (e: ReactMouseEvent) => {
    // In a text field with selected text, leave room for the Cut/Copy/Paste menu instead.
    const t = e.target as HTMLElement;
    const editable = t.closest('input, textarea, [contenteditable="true"]');
    if (editable && (window.getSelection()?.toString() || (t instanceof HTMLInputElement && t.selectionStart !== t.selectionEnd))) return;
    e.preventDefault();
    e.stopPropagation();
    useContextMenuState.setState({ items: items(), x: e.clientX, y: e.clientY, open: true });
  };
}

export function ContextMenuHost() {
  const { items, x, y, open } = useContextMenuState();
  const [anchor, setAnchor] = useState<Anchor>({ kind: 'point', x, y });
  useLayoutEffect(() => setAnchor({ kind: 'point', x, y }), [x, y, open]);
  const close = useCallback(() => useContextMenuState.setState({ open: false }), []);
  if (!open) return null;
  return <MenuPopover items={items} anchor={anchor} onClose={close} />;
}
