import { useStore } from '../store';
import type { ColorScheme } from '../types';
import { isElectron, type DockState } from '../lib/platform';
import { MenuButton } from './Menu';
import { SyncSettings } from './SyncSettings';
import { exportMenu, runImport } from '../lib/commands';

const SCHEMES: { id: ColorScheme; name: string; side: string; primary: string; accent: string }[] = [
  { id: 'teal', name: 'Teal & yellow', side: '#069494', primary: '#069494', accent: '#ffd43b' },
  { id: 'royal', name: 'Royal blue & orange-gold', side: '#1b358a', primary: '#2244a6', accent: '#ffa62b' },
  { id: 'graphite', name: 'Graphite & amber', side: '#22262d', primary: '#454c59', accent: '#ffad33' },
];


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

      <SyncSettings />

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


    </div>
  );
}
