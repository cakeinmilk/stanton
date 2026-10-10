import { useEffect, useState } from 'react';
import { bridge, errorMessage, isElectron, type TelegramStatus } from '../lib/platform';
import { confirmDialog } from './Dialogs';
import { HELP } from '../lib/remote';

/** Settings → Telegram: connect your own bot so you can message Stanton from your phone. */
export function TelegramSettings() {
  const [st, setSt] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bridge.telegram.status().then(setSt);
    return bridge.telegram.onStatus(setSt);
  }, []);

  if (!isElectron) return null;

  const run = async (fn: () => Promise<TelegramStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setSt(await fn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const link = st?.botName && st.pairingCode ? `https://t.me/${st.botName}?start=${st.pairingCode}` : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Telegram</h2>
        {st?.paired && <span className="pill ok">Connected{st.chatName ? ` to ${st.chatName}` : ''}</span>}
      </div>
      <p className="setting-text">
        Message Stanton from your phone: anything you send lands in your <b>Scratchpad</b>, and you can check or tick off action points. Stanton needs to be running (it's fine in
        the tray). Messages sent while the PC is off arrive the next time Stanton starts, as long as that's within 24 hours.
      </p>
      <p className="setting-hint">
        <b>On a work PC, check with IT first.</b> Security software (e.g. CrowdStrike) may block programs that connect to Telegram, and company policy may not allow it.
      </p>

      {st?.suspended && (
        <div className="callout warn">
          <p>
            <b>Telegram is paused.</b> Stanton was stopped while it was connected to Telegram last time. That's usually a security tool such as CrowdStrike blocking it. On a work PC,
            please check with your IT team before using this feature, or disconnect it below.
          </p>
          <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => void run(() => bridge.telegram.disconnect())}>
            Disconnect Telegram
          </button>
        </div>
      )}

      {!st?.configured ? (
        <>
          <ol className="setting-steps">
            <li>
              In Telegram, open{' '}
              <button type="button" className="link-btn" onClick={() => void bridge.openExternal('https://t.me/BotFather')}>
                @BotFather
              </button>
              , send <code>/newbot</code> and follow the prompts (any name works).
            </li>
            <li>BotFather replies with a token like <code>123456:ABC-DEF…</code>. Paste it here:</li>
          </ol>
          <div className="setting-row">
            <input type="password" className="text-input grow" placeholder="Bot token from @BotFather" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Telegram bot token" />
            <button type="button" className="btn btn-primary" disabled={!token.trim() || busy} onClick={() => void run(() => bridge.telegram.setToken(token))}>
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
        </>
      ) : !st.paired ? (
        <>
          <p className="setting-text">
            Bot <b>@{st.botName}</b> is ready. Now link it to your Telegram account so only you can use it:
          </p>
          {st.pairingCode ? (
            <div className="pairing">
              <button type="button" className="btn btn-primary" onClick={() => link && void bridge.openExternal(link)}>
                Open Telegram to pair ↗
              </button>
              <span className="setting-hint">
                or send <code>/start {st.pairingCode}</code> to @{st.botName}. Waiting…
              </span>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => bridge.telegram.startPairing())}>
              Pair my phone
            </button>
          )}
        </>
      ) : (
        <details className="tg-help">
          <summary>What can I send?</summary>
          <pre>{HELP}</pre>
        </details>
      )}

      {error && <p className="setting-status error">{error}</p>}

      {st?.configured && (
        <div className="setting-row">
          {st.paired && (
            <button type="button" className="btn btn-small" onClick={() => void run(() => bridge.telegram.unpair())}>
              Unpair phone
            </button>
          )}
          <button
            type="button"
            className="btn btn-small btn-danger-ghost"
            onClick={async () => {
              if (await confirmDialog('Disconnect Telegram?', 'Stanton will stop listening to your bot and forget its token.', { okLabel: 'Disconnect', danger: true }))
                void run(() => bridge.telegram.disconnect());
            }}
          >
            Disconnect
          </button>
        </div>
      )}
      <p className="setting-hint">
        Your bot token is stored encrypted on this PC. Only the paired chat is listened to. Telegram bot chats aren't end-to-end encrypted, so don't send anything you wouldn't put in a
        normal Telegram chat.
      </p>
    </section>
  );
}
