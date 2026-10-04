import { useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';

type Dialog =
  | { kind: 'prompt'; title: string; label?: string; value: string; okLabel?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void };

const useDialogs = create<{ dialog: Dialog | null }>(() => ({ dialog: null }));

export function promptDialog(title: string, value = '', opts: { label?: string; okLabel?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => useDialogs.setState({ dialog: { kind: 'prompt', title, value, ...opts, resolve } }));
}

export function confirmDialog(title: string, message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => useDialogs.setState({ dialog: { kind: 'confirm', title, message, ...opts, resolve } }));
}

export function DialogHost() {
  const dialog = useDialogs((s) => s.dialog);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (dialog?.kind === 'prompt') {
      setValue(dialog.value);
      if (inputRef.current) {
        inputRef.current.value = dialog.value;
        inputRef.current.focus();
        inputRef.current.select();
      }
    } else if (dialog) {
      okRef.current?.focus();
    }
  }, [dialog]);

  if (!dialog) return null;

  const close = (ok: boolean) => {
    useDialogs.setState({ dialog: null });
    if (dialog.kind === 'prompt') dialog.resolve(ok ? value.trim() || null : null);
    else dialog.resolve(ok);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <form
        className="modal"
        role="dialog"
        aria-label={dialog.title}
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
        onKeyDown={(e) => e.key === 'Escape' && close(false)}
      >
        <h2>{dialog.title}</h2>
        {dialog.kind === 'prompt' ? (
          <label className="field">
            {dialog.label && <span>{dialog.label}</span>}
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        ) : (
          <p className="modal-message">{dialog.message}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => close(false)}>
            Cancel
          </button>
          <button ref={okRef} type="submit" className={`btn ${dialog.kind === 'confirm' && dialog.danger ? 'btn-danger' : 'btn-primary'}`}>
            {dialog.okLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
