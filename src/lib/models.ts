import { create } from 'zustand';
import { bridge, errorMessage } from './platform';

export interface ModelInfo {
  id: string;
  label: string;
}

export type ModelTier = 'lite' | 'flash' | 'pro' | 'other';

export interface ModelOption extends ModelInfo {
  tier: ModelTier;
  preview: boolean;
  alias: boolean;
}

const TIER_ORDER: Record<ModelTier, number> = { lite: 0, flash: 1, pro: 2, other: 3 };
export const TIER_HINT: Record<ModelTier, string> = {
  lite: 'Lightest & fastest – fine for weekly plans',
  flash: 'Balanced',
  pro: 'Most capable – slower, uses more quota',
  other: 'Other',
};

// Variants that don't produce plain text replies (images, speech, live audio, embeddings…).
const NOT_FOR_TEXT = /(image|tts|live|audio|embedding|embed|native|robotics|computer-use|aqa|veo|imagen|learnlm|gemma)/i;

export function tierOf(id: string): ModelTier {
  if (/lite/i.test(id)) return 'lite';
  if (/flash/i.test(id)) return 'flash';
  if (/pro/i.test(id)) return 'pro';
  return 'other';
}

function version(id: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/i.exec(id);
  return m ? Number(m[1]) : 0;
}

/** Text models only, lightest first; "-latest" aliases and stable releases before previews; newest versions first. */
export function sortModels(list: ModelInfo[]): ModelOption[] {
  return list
    .filter((m) => /gemini/i.test(m.id) && !NOT_FOR_TEXT.test(m.id))
    .map((m) => ({ ...m, tier: tierOf(m.id), preview: /preview|exp/i.test(m.id), alias: /-latest$/i.test(m.id) }))
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        Number(b.alias) - Number(a.alias) ||
        Number(a.preview) - Number(b.preview) ||
        version(b.id) - version(a.id) ||
        a.id.localeCompare(b.id),
    );
}

/** The model to suggest when the current choice isn't available: the lightest stable model. */
export function suggestModel(options: ModelOption[]): string | undefined {
  return (options.find((m) => m.tier === 'lite' && !m.preview) ?? options.find((m) => !m.preview) ?? options[0])?.id;
}

interface ModelsState {
  options: ModelOption[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load(force?: boolean): Promise<void>;
}

/** Model list, fetched once per session (or on demand). */
export const useModels = create<ModelsState>()((set, get) => ({
  options: [],
  status: 'idle',
  error: null,
  async load(force = false) {
    if (!force && (get().status === 'loading' || get().status === 'ready')) return;
    set({ status: 'loading', error: null });
    try {
      const list = await bridge.ai.listModels();
      set({ options: sortModels(list), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: errorMessage(err) });
    }
  },
}));
