import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { QuickSwitcher, TitleBar, useDock } from './components/TitleBar';
import { HomeView } from './components/HomeView';
import { ProjectView } from './components/ProjectView';
import { PageView } from './components/PageView';
import { ArchiveView } from './components/ArchiveView';
import { DialogHost, ToastHost } from './components/Dialogs';
import { ContextMenuHost } from './components/Menu';
import { SettingsView } from './components/SettingsView';
import { PlanView } from './components/PlanView';
import { bridge } from './lib/platform';
import { handleRemoteMessage } from './lib/remote';

const COMPACT_WIDTH = 760;

export function App() {
  const loaded = useStore((s) => s.loaded);
  const view = useStore((s) => s.view);
  const back = useStore((s) => s.back);
  const dockState = useDock();
  const dock = dockState.edge;
  const theme = useStore((s) => s.prefs.theme);
  const scheme = useStore((s) => s.prefs.scheme);
  const [width, setWidth] = useState(window.innerWidth);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const compact = width < COMPACT_WIDTH;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void bridge.setTheme(theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.scheme = scheme;
  }, [scheme]);
  // Messages sent to Stanton's Telegram bot.
  useEffect(() => (loaded ? bridge.telegram.onCommand(handleRemoteMessage) : undefined), [loaded]);
  const minimizeToTray = useStore((s) => s.prefs.minimizeToTray);
  useEffect(() => {
    if (loaded) void bridge.setMinimizeToTray(minimizeToTray);
  }, [minimizeToTray, loaded]);

  useEffect(() => {
    if (!compact) setNavOpen(false);
  }, [compact]);

  // Scroll to top when switching views.
  const viewKey = view.name === 'page' ? `page:${view.pageId}` : view.name === 'project' ? `project:${view.projectId}` : view.name;
  useEffect(() => {
    if (view.name !== 'page' || !view.focusEntryId) mainRef.current?.scrollTo({ top: 0 });
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') back();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        const input = document.querySelector<HTMLInputElement>('.sidebar .search input');
        if (compact) setNavOpen(true);
        setTimeout(() => (input ?? document.querySelector<HTMLInputElement>('.sidebar .search input'))?.focus(), 0);
        e.preventDefault();
      }
    };
    const onMouse = (e: MouseEvent) => e.button === 3 && back();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, [back, compact]);

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <div className={`app${compact ? ' is-compact' : ''}${dock ? ` docked-${dock}` : ''}`}>
      <TitleBar compact={compact} dockState={dockState} onToggleNav={() => setNavOpen((o) => !o)} />
      {compact && <QuickSwitcher />}
      <div className="body">
        {!compact && <Sidebar />}
        {compact && navOpen && (
          <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setNavOpen(false)}>
            <div className="drawer">
              <Sidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        )}
        <main className="main" ref={mainRef}>
          {view.name === 'home' && <HomeView />}
          {view.name === 'project' && <ProjectView key={view.projectId} projectId={view.projectId} />}
          {view.name === 'page' && <PageView key={view.pageId} pageId={view.pageId} focusEntryId={view.focusEntryId} focusActionId={view.focusActionId} />}
          {view.name === 'archive' && <ArchiveView />}
          {view.name === 'plan' && <PlanView />}
          {view.name === 'settings' && <SettingsView dockState={dockState} />}
        </main>
      </div>
      <DialogHost />
      <ContextMenuHost />
      <ToastHost />
    </div>
  );
}
