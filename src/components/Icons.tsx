/** Small line icons drawn in the current text colour, so they follow the theme and project colour. */
type P = { size?: number; className?: string; title?: string };

export function PinIcon({ size = 16, className = '', title }: P) {
  return (
    <svg className={`svg-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path
        d="M9 3h6l-1 6 3.5 3.5V14H6.5v-1.5L10 9 9 3Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 14v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Marks a whole meeting/note as an action point (bullets use the star). */
export function FlagIcon({ size = 16, className = '', title, filled = false }: P & { filled?: boolean }) {
  return (
    <svg className={`svg-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M5 21V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M5 4h11.5l-2.2 4 2.2 4H5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarIcon({ size = 16, className = '' }: P) {
  return (
    <svg className={`svg-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Window with a docked panel on one edge; the chevron shows which way clicking will move it. */
export function DockIcon({ edge, docked, size = 18 }: { edge: 'left' | 'right'; docked: boolean; size?: number }) {
  const left = edge === 'left';
  // Panel strip along the chosen edge (rounded on the outer corners only).
  const panel = left ? 'M5.5 5H9v14H5.5A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5Z' : 'M18.5 5H15v14h3.5a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 18.5 5Z';
  // Chevron points towards the edge to dock, away from it to undock.
  const towardEdge = left !== docked;
  const cx = left ? 15 : 9;
  const chevron = towardEdge ? `M${cx + 1.5} 9l-3 3 3 3` : `M${cx - 1.5} 9l3 3-3 3`;
  return (
    <svg className="svg-icon dock-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d={panel} fill="currentColor" opacity={docked ? 1 : 0.35} />
      <path d={chevron} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinimiseIcon({ size = 16 }: P) {
  return (
    <svg className="svg-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6 12.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MaximiseIcon({ size = 16 }: P) {
  return (
    <svg className="svg-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: P) {
  return (
    <svg className="svg-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Cloud with a tick / arrows / slash / exclamation for the phone's sync state. */
export function CloudIcon({ state, size = 20 }: { state: string; size?: number }) {
  const cloud = 'M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6 6 0 0 0 6.3 9.3 4.6 4.6 0 0 0 7 18.5Z';
  return (
    <svg className={`svg-icon cloud-icon${state === 'syncing' ? ' spin' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={cloud} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      {state === 'idle' && <path d="m9.3 13.6 1.9 1.9 3.6-3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      {state === 'syncing' && <path d="M14.8 12.2a2.9 2.9 0 1 0-.7 2.6M14.9 10.3v2h-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      {(state === 'offline' || state === 'signed-out') && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      {state === 'error' && <path d="M12 10.3v3M12 15.6v.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
