import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { ColorScheme } from '../types';
import { bridge, isElectron, type DockState } from '../lib/platform';
import { suggestModel, useModels } from '../lib/models';
import { ModelPicker } from './ModelPicker';
import { MenuButton } from './Menu';
import { exportMenu, runImport } from '../lib/commands';

const SCHEMES: { id: ColorScheme; name: string; side: string; primary: string; accent: string }[] = [
  { id: 'teal', name: 'Teal & yellow', side: '#069494', primary: '#069494', accent: '#ffd43b' },
  { id: 'royal', name: 'Royal blue & orange-gold', side: '#1b358a', primary: '#2244a6', accent: '#ffa62b' },
  { id: 'graphite', name: 'Graphite & amber', side: '#22262d', primary: '#454c59', accent: '#ffad33' },
];

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

export function SettingsView({ dockState }: { dockState: DockState }) {
  const theme = useStore((s) => s.prefs.theme);
  const scheme = useStore((s) => s.prefs.scheme);
  const minimizeToTray = useStore((s) => s.prefs.minimizeToTray);
  const setPrefs = useStore((s) => s.setPrefs);

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Stanton</p>
          <h1>Settings</h1>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Appearance</h2>
        </div>
        <div className="seg" role="group" aria-label="Theme">
          {(
            [
              ['system', 'Follow Windows'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={theme === value ? 'is-on' : ''} onClick={() => setPrefs({ theme: value })}>
              {label}
            </button>
          ))}
        </div>
        <div className="scheme-grid" role="radiogroup" aria-label="Colour scheme">
          {SCHEMES.map((sc) => (
            <button
              key={sc.id}
              type="button"
              role="radio"
              aria-checked={scheme === sc.id}
              className={`scheme-card${scheme === sc.id ? ' is-on' : ''}`}
              onClick={() => setPrefs({ scheme: sc.id })}
            >
              <span className="scheme-preview" aria-hidden>
                <span className="sp-side" style={{ background: sc.side }} />
                <span className="sp-main">
                  <span className="sp-bar" style={{ background: sc.primary, width: '70%' }} />
                  <span className="sp-bar" style={{ background: sc.accent, width: '40%' }} />
                </span>
              </span>
              <span className="scheme-name">{sc.name}</span>
            </button>
          ))}
        </div>
      </section>

      {isElectron && (
        <section className="panel">
          <div className="panel-head">
            <h2>Docking</h2>
          </div>
          <p className="setting-text">
            {!dockState.edge && 'Not docked. Use ⇤ or ⇥ in the title bar to dock Stanton to the side of the screen.'}
            {dockState.mode === 'appbar' && `Docked ${dockState.edge}. Windows has reserved the space, so maximised windows fit beside Stanton.`}
            {dockState.mode === 'snap' &&
              `Docked ${dockState.edge}, but Windows did not reserve the space, so maximised windows may go behind Stanton. Details are in %APPDATA%\\Stanton\\stanton.log.`}
          </p>
        </section>
      )}

      {isElectron && (
        <section className="panel">
          <div className="panel-head">
            <h2>Window</h2>
          </div>
          <label className="check">
            <input type="checkbox" checked={minimizeToTray} onChange={(e) => setPrefs({ minimizeToTray: e.target.checked })} /> Minimise to the system tray (click the
            Stanton icon by the clock to bring it back)
          </label>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Backup &amp; export</h2>
        </div>
        <p className="setting-text">
          Save everything to a file for safekeeping or to move to another PC, or export a readable copy for other apps. To export a single project, use its ⋯ menu.
        </p>
        <div className="setting-row">
          <MenuButton items={exportMenu()} label="Export everything" className="btn-like">
            ⇪ Export everything…
          </MenuButton>
          <button type="button" className="btn" onClick={() => void runImport()}>
            Import from a backup…
          </button>
        </div>
        <p className="setting-hint">Importing adds the projects in the file alongside your existing ones; nothing is overwritten.</p>
      </section>

      <GoogleAiSettings />
    </div>
  );
}

function GoogleAiSettings() {
  const model = useStore((s) => s.prefs.aiModel);
  const setPrefs = useStore((s) => s.setPrefs);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'busy'; text: string } | null>(null);
  const loadList = useModels((m) => m.load);

  useEffect(() => {
    void bridge.ai.hasKey().then(setHasKey);
  }, []);

  const loadModels = async () => {
    setStatus({ kind: 'busy', text: 'Checking your key…' });
    await loadList(true);
    const { status: st, options, error } = useModels.getState();
    if (st === 'error') {
      setStatus({ kind: 'error', text: error ?? 'Could not reach Google.' });
      return;
    }
    setStatus({ kind: 'ok', text: `Connected. ${options.length} Gemini text models available.` });
    if (options.length && !options.some((m) => m.id === model)) setPrefs({ aiModel: suggestModel(options)! });
  };

  const save = async () => {
    if (!key.trim()) return;
    await bridge.ai.setKey(key.trim());
    setKey('');
    setHasKey(true);
    await loadModels();
  };

  const remove = async () => {
    await bridge.ai.setKey(null);
    setHasKey(false);
    useModels.setState({ options: [], status: 'idle', error: null });
    setStatus(null);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Google AI (Gemini)</h2>
        {hasKey && <span className="pill ok">Connected</span>}
      </div>
      <p className="setting-text">
        The <b>Weekly plan</b> uses Google Gemini to turn your action points and recent meetings into a plan based on your template. To connect your Google account:
      </p>
      <ol className="setting-steps">
        <li>
          <button type="button" className="btn btn-small btn-primary" onClick={() => void bridge.openExternal(AI_STUDIO_URL)}>
            Open Google AI Studio ↗
          </button>{' '}
          and sign in with your Google account.
        </li>
        <li>
          Click <b>Create API key</b>, copy it and paste it below. Your key is stored encrypted on this PC and only sent to Google.
        </li>
      </ol>
      <div className="setting-row">
        <input
          type="password"
          className="text-input grow"
          placeholder={hasKey ? 'A key is saved. Paste a new one to replace it.' : 'Paste your Gemini API key'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          aria-label="Gemini API key"
        />
        <button type="button" className="btn btn-primary" disabled={!key.trim()} onClick={() => void save()}>
          Save
        </button>
        {hasKey && (
          <>
            <button type="button" className="btn" onClick={() => void loadModels()}>
              Test
            </button>
            <button type="button" className="btn btn-danger-ghost" onClick={() => void remove()}>
              Remove
            </button>
          </>
        )}
      </div>
      {status && <p className={`setting-status ${status.kind}`}>{status.text}</p>}
      <div className="setting-row">
        <ModelPicker hasKey={!!hasKey} />
      </div>
      <p className="setting-hint">
        A Google AI Pro subscription covers the Gemini app, not API keys. API keys from AI Studio have their own free allowance, which is plenty for a weekly plan. On the free
        allowance Google may use what you send to improve its products. Turning on billing for the key stops that.
      </p>
    </section>
  );
}
