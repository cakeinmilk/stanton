import { useEffect, useState } from 'react';
import { applyRemoteData, selectData, useStore } from '../store';
import { bridge, errorMessage, type SyncStatus } from '../lib/platform';
import { formatDateTime } from '../lib/util';
import { confirmDialog, toast } from './Dialogs';
import { googleSignIn, googleSignOut, mobileStatus, onMobileStatus, syncNow } from '../mobile/bridge';

const currentJson = () => JSON.stringify(selectData(useStore.getState()));

/** Settings → Sync (desktop): keep notes in a Google Drive for desktop folder. */
export function SyncSettings() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const sync = bridge.sync;

  useEffect(() => {
    if (!sync) return;
    void sync.status().then(setSt);
    return sync.onStatus(setSt);
  }, [sync]);

  if (!sync || !st) return null;

  const enable = async (folder: string | null) => {
    if (!folder) return;
    setBusy(true);
    try {
      const res = await sync.enable(folder, currentJson());
      applyRemoteData(JSON.parse(res.json));
      setSt(res.status);
      toast(`Syncing through ${folder}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => enable(await sync.chooseFolder(st.suggestion));

  const disable = async () => {
    const ok = await confirmDialog(
      'Stop syncing?',
      'Stanton will keep a copy of everything on this PC and stop using the Google Drive folder. The files in Drive are left as they are.',
      { okLabel: 'Stop syncing' },
    );
    if (!ok) return;
    setSt(await sync.disable(currentJson()));
    toast('Stopped syncing – notes are now kept on this PC only');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sync with Google Drive</h2>
        {st.folder && <span className={`pill ${st.lastError ? 'warn' : 'ok'}`}>{st.lastError ? 'Problem' : 'Syncing'}</span>}
      </div>
      {st.folder ? (
        <>
          <p className="setting-text">
            Your notes are kept in <code>{st.folder}</code>. Google Drive for desktop copies them to your Google account, and the Stanton Android app reads and writes the same
            folder. Changes from other devices are merged automatically.
          </p>
          {st.lastSyncedAt && <p className="setting-hint">Last synced {formatDateTime(st.lastSyncedAt)}</p>}
          {st.lastError && <p className="setting-status error">{st.lastError}</p>}
          <div className="setting-row">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void choose()}>
              Move to another folder…
            </button>
            <button type="button" className="btn btn-small btn-danger-ghost" disabled={busy} onClick={() => void disable()}>
              Stop syncing
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="setting-text">
            Keep your notes in a Google Drive folder so they're backed up and available on your phone. This uses <b>Google Drive for desktop</b>, so Stanton doesn't need you to
            sign in here.
          </p>
          <div className="setting-row">
            {st.suggestion ? (
              <>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void enable(st.suggestion)}>
                  Use {st.suggestion}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void choose()}>
                  Choose another folder…
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void choose()}>
                Choose a Google Drive folder…
              </button>
            )}
          </div>
          {!st.suggestion && (
            <p className="setting-hint">
              Google Drive for desktop wasn't found. Install it from{' '}
              <button type="button" className="link-btn" onClick={() => void bridge.openExternal('https://www.google.com/drive/download/')}>
                google.com/drive/download
              </button>
              , sign in, then come back here. It usually appears as drive <b>G:</b> with a <b>My Drive</b> folder.
            </p>
          )}
          <p className="setting-hint">If the folder already has Stanton notes (e.g. from your phone or another PC), they're merged with this PC's. Nothing is lost.</p>
        </>
      )}
    </section>
  );
}

/** Settings → Google Drive (Android app). */
export function MobileSyncSettings() {
  const [st, setSt] = useState<SyncStatus>(mobileStatus());
  const [folder, setFolderText] = useState(st.folder ?? 'Stanton');
  const [busy, setBusy] = useState(false);
  useEffect(() => onMobileStatus(setSt), []);

  const signedIn = st.state !== 'signed-out';
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* status shows the error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Google Drive</h2>
        {signedIn && <span className={`pill ${st.state === 'error' ? 'warn' : 'ok'}`}>{SYNC_LABEL[st.state ?? 'idle']}</span>}
      </div>
      {!signedIn ? (
        <>
          <p className="setting-text">
            Sign in with your Google account to sync with the Stanton folder in your Google Drive – the same folder your PC uses (for example <code>G:\My Drive\Stanton</code>).
          </p>
          <label className="field">
            <span>Folder in My Drive</span>
            <input className="text-input" value={folder} onChange={(e) => setFolderText(e.target.value)} placeholder="Stanton" autoCapitalize="off" autoCorrect="off" />
          </label>
          <div className="setting-row">
            <button type="button" className="btn btn-primary btn-big" disabled={busy} onClick={() => void run(() => googleSignIn(folder))}>
              {busy ? 'Signing in…' : 'Sign in with Google'}
            </button>
          </div>
          <p className="setting-hint">Until you sign in, notes are kept on this phone only. Anything you write now is merged in when you sign in.</p>
        </>
      ) : (
        <>
          <p className="setting-text">
            Signed in as <b>{st.account}</b>. Syncing with <code>My Drive/{st.folder}</code>.
          </p>
          {st.lastSyncedAt && <p className="setting-hint">Last synced {formatDateTime(st.lastSyncedAt)}</p>}
          <div className="setting-row">
            <button type="button" className="btn btn-primary" disabled={busy || st.state === 'syncing'} onClick={() => void run(syncNow)}>
              {st.state === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              className="btn btn-danger-ghost"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog('Sign out of Google?', 'Notes stay on this phone, but stop syncing until you sign in again.', { okLabel: 'Sign out' })) void run(googleSignOut);
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
      {st.lastError && <p className="setting-status error">{st.lastError}</p>}
    </section>
  );
}

export const SYNC_LABEL: Record<NonNullable<SyncStatus['state']>, string> = {
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Problem',
  'signed-out': 'Not signed in',
};
