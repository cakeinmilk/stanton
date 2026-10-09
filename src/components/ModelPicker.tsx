import { useEffect } from 'react';
import { useStore } from '../store';
import { TIER_HINT, useModels, type ModelTier } from '../lib/models';

const TIER_LABEL: Record<ModelTier, string> = { lite: 'Lite', flash: 'Flash', pro: 'Pro', other: 'Other' };

/** Dropdown of the Gemini models available to the user's key, lightest first. */
export function ModelPicker({ hasKey, compact = false }: { hasKey: boolean; compact?: boolean }) {
  const model = useStore((s) => s.prefs.aiModel);
  const setPrefs = useStore((s) => s.setPrefs);
  const { options, status, error, load } = useModels();

  useEffect(() => {
    if (hasKey) void load();
  }, [hasKey, load]);

  if (!hasKey) return null;

  const current = options.find((m) => m.id === model);
  const tiers = (['lite', 'flash', 'pro', 'other'] as ModelTier[]).filter((t) => options.some((m) => m.tier === t));

  return (
    <label className={`field model-picker${compact ? ' compact' : ''}`}>
      <span>Model</span>
      {options.length ? (
        <select className="text-input" value={model} onChange={(e) => setPrefs({ aiModel: e.target.value })} aria-label="Gemini model">
          {!current && <option value={model}>{model} (not available to your key)</option>}
          {tiers.map((t) => (
            <optgroup key={t} label={`${TIER_LABEL[t]} – ${TIER_HINT[t]}`}>
              {options
                .filter((m) => m.tier === t)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.alias ? ' (always latest)' : ''}
                    {m.preview ? ' (preview)' : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <input className="text-input" value={model} onChange={(e) => setPrefs({ aiModel: e.target.value.trim() })} aria-label="Gemini model" />
      )}
      {!compact && current && <small className="model-hint">{TIER_HINT[current.tier]}</small>}
      {status === 'loading' && <small className="model-hint">Loading models…</small>}
      {status === 'error' && (
        <small className="model-hint error">
          Couldn't load the model list: {error}{' '}
          <button type="button" className="link-btn" onClick={() => void load(true)}>
            Retry
          </button>
        </small>
      )}
    </label>
  );
}
