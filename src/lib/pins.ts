import type { Entry } from '../types';
import { formatDate } from './util';

export const PIN_ICONS = ['📍', '⭐', '📝', '👥', '📅', '📊', '📈', '💡', '✅', '⚠️', '🔥', '🎯', '📎', '🔗', '💬', '📞', '📧', '💰', '🧭', '🗂️', '🛠️', '🚀', '❤️', '🔒'];

/** The custom emoji for a pinned entry, or null to use the standard pin icon. */
export const pinIcon = (e: Entry): string | null => e.pinIcon || null;

export function entryLabel(e: Entry): string {
  if (e.title.trim()) return e.kind === 'meeting' ? `${formatDate(e.date)} · ${e.title}` : e.title;
  return e.kind === 'meeting' ? `Meeting · ${formatDate(e.date)}` : `Note · ${formatDate(e.date)}`;
}
