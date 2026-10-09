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
