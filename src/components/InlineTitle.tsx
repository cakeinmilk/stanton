import { useEffect, useState } from 'react';

/** A heading that is edited in place. Commits on blur / Enter. */
export function InlineTitle({ value, onChange, placeholder, className = '', as = 'h1' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; as?: 'h1' | 'h3' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onChange(v);
    else setDraft(value);
  };
  return (
    <input
      className={`inline-title ${as} ${className}`}
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
