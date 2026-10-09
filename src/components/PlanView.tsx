import { useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { useStore } from '../store';
import { bridge, errorMessage } from '../lib/platform';
import { buildPlanPrompt, defaultWeekStart, recentEntries } from '../lib/plan';
import { DEFAULT_PLAN_TEMPLATE } from '../lib/seed';
import { markdownToDoc } from '../editor/extensions';
import { NoteEditor } from '../editor/NoteEditor';
import { copyDoc, docToPlainText, gmailComposeUrl } from '../lib/export';
import { formatDate } from '../lib/util';
import { confirmDialog } from './Dialogs';
import { ModelPicker } from './ModelPicker';
import { suggestModel, useModels } from '../lib/models';

interface PlanResult {
  doc: JSONContent;
  weekStart: string;
  rev: number;
}

// Keep the last plan and picked entries while the user moves around the app.
let lastResult: PlanResult | null = null;
let lastPicked: string[] = [];

export function PlanView() {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const projects = useStore((s) => s.projects);
  const pages = useStore((s) => s.pages);
  const entries = useStore((s) => s.entries);
  const navigate = useStore((s) => s.navigate);

  const [weekStart, setWeekStart] = useState(() => lastResult?.weekStart ?? defaultWeekStart());
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResult | null>(lastResult);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(lastPicked);
  const [showPicker, setShowPicker] = useState(lastPicked.length > 0);
  useEffect(() => {
    lastPicked = picked;
  }, [picked]);

  useEffect(() => {
    void bridge.ai.hasKey().then(setHasKey);
  }, []);
  // If the saved model isn't offered to this key (e.g. retired), switch to the lightest available one.
  const modelOptions = useModels((m) => m.options);
  useEffect(() => {
    if (modelOptions.length && !modelOptions.some((m) => m.id === prefs.aiModel)) setPrefs({ aiModel: suggestModel(modelOptions)! });
  }, [modelOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    lastResult = result;
  }, [result]);

  const plan = useMemo(
    () =>
      buildPlanPrompt({ projects, pages, entries }, prefs.planTemplate, {
        weekStart,
        notes: prefs.planNotes,
        includeActions: prefs.planIncludeActions,
        includeDone: prefs.planIncludeDone,
        entryIds: picked,
        days: prefs.planDays,
      }),
    [projects, pages, entries, prefs.planTemplate, prefs.planNotes, prefs.planIncludeActions, prefs.planIncludeDone, prefs.planDays, picked, weekStart],
  );
  const candidates = useMemo(() => recentEntries({ projects, pages, entries }, prefs.planDays), [projects, pages, entries, prefs.planDays]);
  const openActionCount = useMemo(
    () => buildPlanPrompt({ projects, pages, entries }, '', { weekStart, notes: '', includeActions: true, includeDone: false, entryIds: [] }).stats.actions,
    [projects, pages, entries, weekStart],
  );
  const nothingToSend = !plan.stats.notes && !plan.stats.actions && !plan.stats.entries;
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const livePages = pages.filter((p) => !p.archivedAt && projects.some((pr) => pr.id === p.projectId && !pr.archivedAt));
  const [targetPage, setTargetPage] = useState('');
  const title = `Weekly plan – week of ${formatDate(weekStart)}`;

  const generate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const md = await bridge.ai.generate(prefs.aiModel, plan.system, plan.prompt);
      setResult({ doc: markdownToDoc(md), weekStart, rev: (result?.rev ?? 0) + 1 });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveToPage = () => {
    if (!result || !targetPage) return;
    const st = useStore.getState();
    const id = st.addEntry(targetPage, 'note');
    st.updateEntry(id, { title });
    st.setEntryContent(id, result.doc);
    navigate({ name: 'page', pageId: targetPage, focusEntryId: id });
  };

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 2500);
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <p className="eyebrow">Powered by Google Gemini</p>
          <h1>Weekly plan</h1>
        </div>
      </header>

      {hasKey === false && (
        <section className="panel callout">
          <p>
            Connect your Google account first: go to <b>Settings → Google AI</b> and add a Gemini API key.
          </p>
          <button type="button" className="btn btn-primary btn-small" onClick={() => navigate({ name: 'settings' })}>
            Open Settings
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Your notes for this week</h2>
          {prefs.planNotes && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setPrefs({ planNotes: '' })}>
              Clear
            </button>
          )}
        </div>
        <textarea
          className="text-input notes-input"
          rows={8}
          value={prefs.planNotes}
          onChange={(e) => setPrefs({ planNotes: e.target.value })}
          placeholder={"Type or paste anything for this week. For example:\nStephanie's performance feedback is due, two versions (her + my boss)\nLoans CRM analysis from Stephanie needed by Wednesday\nNeed Jake to agree October dashboard thresholds before briefing Matt"}
          aria-label="Your notes for this week"
        />
      </section>

      <section className="panel">
        <div className="plan-options">
          <label className="field">
            <span>Week starting</span>
            <input type="date" className="text-input" value={weekStart} onChange={(e) => e.target.value && setWeekStart(e.target.value)} />
          </label>
          <div className="plan-checks">
            <label className="check">
              <input type="checkbox" checked={prefs.planIncludeActions} onChange={(e) => setPrefs({ planIncludeActions: e.target.checked })} /> Include my open action points ({openActionCount})
            </label>
            {prefs.planIncludeActions && (
              <label className="check sub">
                <input type="checkbox" checked={prefs.planIncludeDone} onChange={(e) => setPrefs({ planIncludeDone: e.target.checked })} /> …and ones completed recently
              </label>
            )}
          </div>
        </div>

        <div className="picker">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker}>
            {showPicker ? '▾' : '▸'} Add meetings &amp; notes{picked.length ? ` (${picked.length} added)` : ''}
          </button>
          {showPicker && (
            <div className="picker-body">
              <div className="picker-head">
                <label className="check">
                  From the last
                  <select className="text-input small" value={prefs.planDays} onChange={(e) => setPrefs({ planDays: Number(e.target.value) })}>
                    {[3, 7, 14, 30, 90].map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </label>
                <span className="grow" />
                <button type="button" className="link-btn" onClick={() => setPicked(candidates.map((c) => c.entry.id))}>
                  Select all
                </button>
                <button type="button" className="link-btn" onClick={() => setPicked([])}>
                  None
                </button>
              </div>
              {!candidates.length && <p className="empty-hint">No meetings or notes in that period.</p>}
              <ul className="picker-list">
                {candidates.map(({ entry, page, project }) => (
                  <li key={entry.id}>
                    <label className="check">
                      <input type="checkbox" checked={picked.includes(entry.id)} onChange={() => togglePick(entry.id)} />
                      <span className="dot" style={{ background: project.color }} />
                      <span className="picker-title">
                        {entry.kind === 'meeting' ? `${formatDate(entry.date)} · ` : ''}
                        {entry.title || 'Untitled'}
                      </span>
                      <span className="picker-meta">
                        {project.name} › {page.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="plan-summary">
          Will send {plan.stats.notes ? 'your notes, ' : ''}
          <b>{plan.stats.actions}</b> action point{plan.stats.actions === 1 ? '' : 's'} and <b>{plan.stats.entries}</b> meeting{plan.stats.entries === 1 ? '' : 's'}/note
          {plan.stats.entries === 1 ? '' : 's'} to Gemini ({prefs.aiModel}).
          {plan.stats.truncated && ' Some long notes were shortened.'}{' '}
          <button type="button" className="link-btn" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? 'Hide' : 'Show'} exactly what will be sent
          </button>
        </div>
        {showPrompt && <pre className="prompt-preview">{plan.prompt}</pre>}

        <div className="plan-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowTemplate((v) => !v)} aria-expanded={showTemplate}>
            {showTemplate ? '▾' : '▸'} Template
          </button>
          <ModelPicker hasKey={!!hasKey} compact />
          <button type="button" className="btn btn-primary" disabled={busy || !hasKey || nothingToSend} onClick={() => void generate()}>
            {busy ? 'Generating…' : result ? '↻ Generate again' : '✦ Generate plan'}
          </button>
        </div>

        {showTemplate && (
          <div className="template-editor">
            <p className="setting-hint">
              This is the layout Gemini copies. Write it in Markdown: <code>**bold**</code>, <code>- bullets</code> with two-space indents for sub-bullets, and{' '}
              <code>## headings</code>. Put instructions in [square brackets]. You can also use <code>{'{{week_start}}'}</code>, <code>{'{{week_end}}'}</code> and{' '}
              <code>{'{{today}}'}</code>.
            </p>
            <textarea className="text-input" value={prefs.planTemplate} spellCheck onChange={(e) => setPrefs({ planTemplate: e.target.value })} rows={14} aria-label="Weekly plan template" />
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={async () => {
                if (await confirmDialog('Reset template?', 'Your template will be replaced with the default one.', { okLabel: 'Reset' })) setPrefs({ planTemplate: DEFAULT_PLAN_TEMPLATE });
              }}
            >
              Reset to default
            </button>
          </div>
        )}
        {error && <p className="setting-status error">{error}</p>}
      </section>

      {result && (
        <section className="panel plan-result">
          <div className="panel-head">
            <h2>{`Week of ${formatDate(result.weekStart)}`}</h2>
            <div className="plan-buttons">
              <button
                type="button"
                className="btn btn-small"
                onClick={async () => {
                  await copyDoc(result.doc);
                  flash('Copied to the clipboard');
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="btn btn-small"
                title="Open a new Gmail message with this plan"
                onClick={() => void bridge.openExternal(gmailComposeUrl(title, docToPlainText(result.doc)))}
              >
                Email with Gmail ↗
              </button>
            </div>
          </div>
          {notice && <p className="setting-status ok">{notice}</p>}
          <p className="setting-hint">You can edit the plan here before you save or send it. Star a bullet to turn it into an action point once it's saved to a page.</p>
          <div className="entry-card plan-doc">
            <NoteEditor
              key={result.rev}
              content={result.doc}
              externalRev={0}
              placeholder=""
              onChange={(doc) => setResult((r) => (r ? { ...r, doc } : r))}
            />
          </div>
          <div className="setting-row">
            <select className="text-input grow" value={targetPage} onChange={(e) => setTargetPage(e.target.value)} aria-label="Page to save to">
              <option value="">Save as a note on page…</option>
              {projects
                .filter((p) => !p.archivedAt)
                .map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {livePages
                      .filter((pg) => pg.projectId === p.id)
                      .map((pg) => (
                        <option key={pg.id} value={pg.id}>
                          {pg.title}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={!targetPage} onClick={saveToPage}>
              Save
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

