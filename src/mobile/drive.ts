/**
 * Minimal Google Drive REST client for the Android app.
 * Tokens come from the native GoogleDrive plugin (Play services); nothing is stored here.
 */
import { registerPlugin } from '@capacitor/core';

interface GoogleDrivePlugin {
  authorize(opts: { interactive: boolean }): Promise<{ accessToken: string }>;
  clearToken(opts: { accessToken: string }): Promise<void>;
}

const Native = registerPlugin<GoogleDrivePlugin>('GoogleDrive');

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  version?: string;
  modifiedTime?: string;
  mimeType?: string;
}

export class DriveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let token: string | null = null;

export async function signIn(interactive: boolean): Promise<void> {
  token = (await Native.authorize({ interactive })).accessToken;
}

export async function signOut() {
  if (!token) return;
  const t = token;
  token = null;
  // Revoke Stanton's access to Drive and drop the cached token.
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined);
  await Native.clearToken({ accessToken: t }).catch(() => undefined);
}

export const hasToken = () => !!token;

/** fetch with the access token; on 401 refresh it once silently. */
async function call(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  if (!token) await signIn(false);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    if (token) await Native.clearToken({ accessToken: token }).catch(() => undefined);
    token = null;
    await signIn(false);
    return call(url, init, false);
  }
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    throw new DriveError(body?.error?.message ?? `Google Drive error ${res.status}`, res.status);
  }
  return res;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function list(query: string, fields = 'files(id,name,version,modifiedTime,mimeType)'): Promise<DriveFile[]> {
  const url = `${API}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc&pageSize=100&spaces=drive`;
  return ((await (await call(url)).json()) as { files: DriveFile[] }).files ?? [];
}

export async function whoAmI(): Promise<string> {
  const r: any = await (await call(`${API}/about?fields=user(emailAddress,displayName)`)).json();
  return r?.user?.emailAddress ?? r?.user?.displayName ?? 'Google account';
}

async function child(parentId: string, name: string, folder: boolean): Promise<DriveFile | undefined> {
  const kind = folder ? `mimeType = '${FOLDER}'` : `mimeType != '${FOLDER}'`;
  return (await list(`'${parentId}' in parents and name = '${q(name)}' and ${kind} and trashed = false`))[0];
}

async function createFolder(parentId: string, name: string): Promise<DriveFile> {
  const res = await call(`${API}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  return res.json();
}

/** Resolve "Stanton" or "Work/Stanton" under My Drive to a folder id (creating it if allowed). */
export async function folderByPath(path: string, create: boolean): Promise<string | null> {
  let parent = 'root';
  for (const part of path.split('/').map((p) => p.trim()).filter(Boolean)) {
    let f = await child(parent, part, true);
    if (!f) {
      if (!create) return null;
      f = await createFolder(parent, part);
    }
    parent = f.id;
  }
  return parent;
}

export async function subfolder(parentId: string, name: string): Promise<string> {
  return (await child(parentId, name, true))?.id ?? (await createFolder(parentId, name)).id;
}

export async function findFile(parentId: string, name: string): Promise<DriveFile | undefined> {
  return child(parentId, name, false);
}

export async function downloadText(id: string): Promise<string> {
  return (await call(`${API}/files/${id}?alt=media`)).text();
}

export async function downloadBlob(id: string): Promise<Blob> {
  return (await call(`${API}/files/${id}?alt=media`)).blob();
}

/** Create or overwrite a file. Overwriting keeps the same Drive file (and its version history). */
export async function upload(parentId: string, name: string, body: Blob, existingId?: string): Promise<DriveFile> {
  const fields = 'fields=id,name,version,modifiedTime';
  if (existingId) {
    const res = await call(`${UPLOAD}/files/${existingId}?uploadType=media&${fields}`, { method: 'PATCH', headers: { 'content-type': body.type || 'application/octet-stream' }, body });
    return res.json();
  }
  const boundary = `stanton${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: [parentId] });
  const multipart = new Blob(
    [`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${body.type || 'application/octet-stream'}\r\n\r\n`, body, `\r\n--${boundary}--`],
  );
  const res = await call(`${UPLOAD}/files?uploadType=multipart&${fields}`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: multipart });
  return res.json();
}
