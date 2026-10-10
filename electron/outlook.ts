/**
 * Read the local (classic) Outlook calendar through its COM object model, via PowerShell.
 * Teams meetings live in the Outlook calendar too, so they come through here as well.
 * The "new Outlook" app has no COM interface; for that, an .ics file can be imported instead.
 */
import { execFile } from 'node:child_process';
import { ipcMain } from 'electron';
import { log } from './log';

export interface OutlookEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string[];
  agenda: string;
  teams: boolean;
}

function script(offsetDays: number, days: number) {
  return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { $ol = New-Object -ComObject Outlook.Application }
$cal = $ol.GetNamespace('MAPI').GetDefaultFolder(9)
$items = $cal.Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')
$start = (Get-Date).Date.AddDays(${Math.trunc(offsetDays)})
$end = $start.AddDays(${Math.max(1, Math.trunc(days))})
$filter = "[Start] >= '" + $start.ToString('g') + "' AND [Start] < '" + $end.ToString('g') + "'"
$out = New-Object System.Collections.ArrayList
foreach ($i in $items.Restrict($filter)) {
  $body = ''
  try { $body = [string]$i.Body } catch {}
  $req = ''; $opt = ''; $org = ''
  try { $req = [string]$i.RequiredAttendees; $opt = [string]$i.OptionalAttendees; $org = [string]$i.Organizer } catch {}
  $id = ''
  try { $id = [string]$i.GlobalAppointmentID } catch {}
  if (-not $id) { $id = [string]$i.EntryID + '|' + $i.Start.ToString('o') }
  [void]$out.Add([pscustomobject]@{
    id = $id + '|' + $i.Start.ToString('yyyyMMdd')
    subject = [string]$i.Subject
    start = $i.Start.ToString('yyyy-MM-ddTHH:mm:ss')
    end = $i.End.ToString('yyyy-MM-ddTHH:mm:ss')
    allDay = [bool]$i.AllDayEvent
    location = [string]$i.Location
    organizer = $org
    required = $req
    optional = $opt
    body = if ($body.Length -gt 4000) { $body.Substring(0, 4000) } else { $body }
  })
  if ($out.Count -ge 150) { break }
}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
`;
}

const splitNames = (s: string) =>
  (s || '')
    .split(';')
    .map((n) => n.trim().replace(/\s*<[^>]*>$/, '').replace(/^"|"$/g, ''))
    .filter(Boolean);

/** Keep the human-written part of an invite: drop Teams/Zoom join boilerplate and long blank runs. */
export function cleanAgenda(body: string): string {
  let text = (body || '').replace(/\r\n/g, '\n');
  const cut = text.search(/\n_{10,}|\n-{10,}|Microsoft Teams (meeting|Need help\?)|Join on your computer|Join Zoom Meeting/i);
  if (cut >= 0) text = text.slice(0, cut);
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, a) => l || (a[i - 1] && a[i - 1].trim()))
    .join('\n')
    .trim()
    .slice(0, 2000);
}

export function readOutlook(offsetDays: number, days: number): Promise<OutlookEvent[]> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Outlook import works on Windows with the Outlook desktop app.'));
  const encoded = Buffer.from(script(offsetDays, days), 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 45000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          log('Outlook read failed', err.message, stderr);
          const msg = /80040154|Class not registered|ComObject|0x80080005/i.test(`${stderr} ${err.message}`)
            ? "Couldn't find the classic Outlook desktop app. The new Outlook app doesn't let other programs read its calendar – save the invite as an .ics file and import that instead."
            : `Couldn't read Outlook: ${(stderr || err.message).split('\n')[0].slice(0, 200)}`;
          reject(new Error(msg));
          return;
        }
        try {
          const raw = JSON.parse(stdout.trim() || '[]') as any[];
          resolve(
            raw.map((r) => {
              const body = String(r.body ?? '');
              return {
                id: String(r.id),
                subject: String(r.subject ?? '').trim() || '(no subject)',
                start: String(r.start),
                end: String(r.end),
                allDay: !!r.allDay,
                location: String(r.location ?? ''),
                organizer: String(r.organizer ?? ''),
                attendees: [...new Set([...splitNames(r.required), ...splitNames(r.optional)])],
                agenda: cleanAgenda(body),
                teams: /teams\.microsoft\.com|Microsoft Teams/i.test(`${body} ${r.location ?? ''}`),
              };
            }),
          );
        } catch (e) {
          log('Outlook output not JSON', stdout.slice(0, 500));
          reject(new Error("Outlook returned something Stanton couldn't read."));
        }
      },
    );
  });
}

export function registerOutlookIpc() {
  ipcMain.handle('outlook:events', (_e, offsetDays: number, days: number) => readOutlook(offsetDays, days));
}
