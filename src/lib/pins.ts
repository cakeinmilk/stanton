import type { Entry } from '../types';
import { formatDate } from './util';

export const PIN_ICONS = ['📌', '⭐', '📝', '👥', '📅', '📊', '📈', '💡', '✅', '⚠️', '🔥', '🎯', '📎', '🔗', '💬', '📞', '📧', '💰', '🧭', '🗂️', '🛠️', '🚀', '❤️', '🔒'];

export const defaultPinIcon = (e: Entry) => (e.kind === 'meeting' ? '👥' : '📝');
export const pinIcon = (e: Entry) => e.pinIcon || defaultPinIcon(e);

export function entryLabel(e: Entry): string {
  if (e.title.trim()) return e.kind === 'meeting' ? `${formatDate(e.date)} · ${e.title}` : e.title;
  return e.kind === 'meeting' ? `Meeting · ${formatDate(e.date)}` : `Note · ${formatDate(e.date)}`;
}
