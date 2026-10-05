import { useEffect, useState } from 'react';
import { bridge, isElectron, type DockState } from '../lib/platform';
import { useStore } from '../store';

export function useDock() {
  const [state, setState] = useState<DockState>({ edge: null, mode: null });
  useEffect(() => {
    void bridge.getDock().then(setState);
    return bridge.onDockChanged(setState);
  }, []);
  return state;
}

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' } as const;
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' } as const;
const THEME_LABEL = { system: 'Theme: follow Windows', light: 'Theme: light', dark: 'Theme: dark' } as const;

export function TitleBar({ compact, onToggleNav, dockState }: { compact: boolean; onToggleNav: () => void; dockState: DockState }) {
  const back = useStore((s) => s.back);
  const canGoBack = useStore((s) => s.history.length > 0);
  const saveState = useStore((s) => s.saveState);
  const theme = useStore((s) => s.prefs.theme);
  const setPrefs = useStore((s) => s.setPrefs);
  const navigate = useStore((s) => s.navigate);
  const dock = dockState.edge;
  const dockNote = dockState.mode === 'snap' ? ' (Windows did not reserve the space – see Settings)' : '';

  return (
    <header className={`titlebar${dock ? ' is-docked' : ''}`} onDoubleClick={(e) => e.target === e.currentTarget && !dock && bridge.toggleMaximize()}>
      {compact && (
        <button type="button" className="tb-icon" aria-label="Show projects and pages" title="Projects and pages" onClick={onToggleNav}>
          ☰
        </button>
      )}
      <button type="button" className="tb-icon" aria-label="Back" title="Back (Alt+←)" disabled={!canGoBack} onClick={back}>
        ←
      </button>
      <div className="brand">
        <span className="brand-mark">S</span>
        {!compact && <span className="brand-name">Stanton</span>}
      </div>
      <span className={`save-state ${saveState}`} title={saveState === 'error' ? 'Could not save – retrying' : saveState === 'saving' ? 'Saving…' : 'All changes saved'}>
        {saveState === 'error' ? '⚠' : saveState === 'saving' ? '•' : ''}
      </span>
      <div className="drag-space" />
      <button
        type="button"
        className="tb-icon"
        aria-label={`${THEME_LABEL[theme]} (click to change)`}
        title={`${THEME_LABEL[theme]} – click to change`}
        onClick={() => setPrefs({ theme: THEME_NEXT[theme] })}
      >
        {THEME_ICON[theme]}
      </button>
      <button type="button" className="tb-icon" aria-label="Settings" title="Settings" onClick={() => navigate({ name: 'settings' })}>
        ⚙
      </button>
      {isElectron && (
        <div className="window-controls">
          <span className="tb-sep" />
          <button
            type="button"
            className={`tb-icon dock-btn${dock === 'left' ? ' is-on' : ''}`}
            title={dock === 'left' ? `Undock${dockNote}` : 'Dock to left of screen'}
            aria-label={dock === 'left' ? 'Undock' : 'Dock left'}
            onClick={() => void bridge.dock(dock === 'left' ? null : 'left')}
          >
            ⇤
          </button>
          <button
            type="button"
            className={`tb-icon dock-btn${dock === 'right' ? ' is-on' : ''}`}
            title={dock === 'right' ? `Undock${dockNote}` : 'Dock to right of screen'}
            aria-label={dock === 'right' ? 'Undock' : 'Dock right'}
            onClick={() => void bridge.dock(dock === 'right' ? null : 'right')}
          >
            ⇥
          </button>
          <span className="tb-sep" />
          <button type="button" className="tb-icon" aria-label="Minimise" title="Minimise" onClick={() => bridge.minimize()}>
            ―
          </button>
          {!dock && (
            <button type="button" className="tb-icon" aria-label="Maximise" title="Maximise" onClick={() => bridge.toggleMaximize()}>
              ☐
            </button>
          )}
          <button type="button" className="tb-icon close" aria-label="Close" title="Close" onClick={() => bridge.close()}>
            ✕
          </button>
        </div>
      )}
    </header>
  );
}

/** Quick project/page switcher shown in narrow (docked) layouts. */
export function QuickSwitcher() {
  const view = useStore((s) => s.view);
  const navigate = useStore((s) => s.navigate);
  const allProjects = useStore((s) => s.projects);
  const allPages = useStore((s) => s.pages);
  const projects = allProjects.filter((p) => !p.archivedAt);

  const projectId = view.name === 'project' ? view.projectId : view.name === 'page' ? allPages.find((p) => p.id === view.pageId)?.projectId : '';
  const pages = allPages.filter((p) => p.projectId === projectId && !p.archivedAt);
  const pageId = view.name === 'page' ? view.pageId : '';

  return (
    <div className="quick-switcher">
      <select
        aria-label="Project"
        value={view.name === 'home' ? '__home' : view.name === 'archive' ? '__archive' : projectId ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__home') navigate({ name: 'home' });
          else if (v === '__archive') navigate({ name: 'archive' });
          else navigate({ name: 'project', projectId: v });
        }}
      >
        <option value="__home">⌂ Home</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__archive">🗄 Archive</option>
      </select>
      {projectId && (
        <select
          aria-label="Page"
          value={pageId}
          onChange={(e) => (e.target.value ? navigate({ name: 'page', pageId: e.target.value }) : navigate({ name: 'project', projectId: projectId! }))}
        >
          <option value="">Overview</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
