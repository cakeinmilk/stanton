import type { Entry } from '../types';
import { formatDate } from './util';
import { KIND_LABEL } from './kinds';

export const PIN_ICONS = ['📍', '⭐', '📝', '👥', '📅', '📊', '📈', '💡', '✅', '⚠️', '🔥', '🎯', '📎', '🔗', '💬', '📞', '📧', '💰', '🧭', '🗂️', '🛠️', '🚀', '❤️', '🔒'];

/** The custom emoji for a pinned entry, or null to use the standard pin icon. */
export const pinIcon = (e: Entry): string | null => e.pinIcon || null;

export function entryLabel(e: Entry): string {
  if (e.title.trim()) return e.kind === 'meeting' ? `${formatDate(e.date)} · ${e.title}` : e.title;
  return `${KIND_LABEL[e.kind]} · ${formatDate(e.date)}`;
}
