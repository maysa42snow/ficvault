/* FicVault Google Drive / Google Docs client-side integration.
 * Uses Google Identity Services + Drive API directly from GitHub Pages.
 * No Firebase Cloud Functions or server-side OAuth tokens are required.
 */

const GOOGLE_DRIVE_CLIENT_ID = '696541919515-b0mgtejfpgnqpa169c8jj3amlfbaaf09.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_STATE_KEY = 'ficvault_google_drive_authorized_v1';

let accessToken = null;
let expiresAt = 0;
let tokenClient = null;
let folderCache = {};
let authPromise = null;

function isTokenUsable() {
  return Boolean(accessToken && Date.now() < expiresAt);
}

function clearToken() {
  accessToken = null;
  expiresAt = 0;
  folderCache = {};
}

function ensureGoogleIdentityServices() {
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    throw new Error('Google authorization could not load. Check your internet connection and make sure Google Identity Services is allowed on this site.');
  }
}

function ensureClientIdConfigured() {
  if (!GOOGLE_DRIVE_CLIENT_ID || GOOGLE_DRIVE_CLIENT_ID.startsWith('YOUR_GOOGLE_')) {
    throw new Error('FicVault still needs its Google OAuth Web Client ID. Add it to drive-client.js before connecting Google Drive.');
  }
}

function markAuthorized(value) {
  try {
    localStorage.setItem(AUTH_STATE_KEY, value ? '1' : '0');
  } catch (_) {}
}

function wasAuthorized() {
  try { return localStorage.getItem(AUTH_STATE_KEY) === '1'; } catch (_) { return false; }
}

function getToken({ prompt = 'none' } = {}) {
  ensureGoogleIdentityServices();
  ensureClientIdConfigured();

  if (isTokenUsable()) return Promise.resolve(accessToken);
  if (authPromise) return authPromise;

  authPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      authPromise = null;
      fn(value);
    };

    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response?.error) {
            const err = new Error(response.error_description || `Google authorization failed: ${response.error}`);
            err.code = response.error;
            finish(reject, err);
            return;
          }
          accessToken = response.access_token;
          expiresAt = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
          folderCache = {};
          markAuthorized(true);
          finish(resolve, accessToken);
        },
        error_callback: (error) => {
          const err = new Error(error?.message || 'Google authorization popup could not be opened.');
          err.code = error?.type || 'popup_failed';
          finish(reject, err);
        }
      });

      tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      finish(reject, error);
    }
  });

  return authPromise;
}

async function apiFetch(url, options = {}, retry = true) {
  await getToken({ prompt: 'none' });
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && retry) {
    clearToken();
    await getToken({ prompt: 'none' });
    return apiFetch(url, options, false);
  }
  return response;
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(name, parentId = null) {
  const cacheKey = `${parentId || 'root'}::${name}`;
  if (folderCache[cacheKey]) return folderCache[cacheKey];

  let q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQuery(name)}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const search = await apiFetch(searchUrl);
  if (!search.ok) throw await driveError(search, 'Could not search Google Drive.');
  const data = await search.json();
  if (data.files?.length) {
    folderCache[cacheKey] = data.files[0].id;
    return data.files[0].id;
  }

  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const create = await apiFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  if (!create.ok) throw await driveError(create, `Could not create Drive folder "${name}".`);
  const created = await create.json();
  folderCache[cacheKey] = created.id;
  return created.id;
}

async function driveError(response, fallback) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || '';
  } catch (_) {
    try { detail = (await response.text()).slice(0, 300); } catch (_) {}
  }
  return new Error(`${fallback} (${response.status})${detail ? ` ${detail}` : ''}`);
}

function multipartBody(metadata, html, boundary) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`
  ].join('\r\n');
}

async function getFileMetadata(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,trashed`;
  const response = await apiFetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw await driveError(response, 'Could not read the Google Doc.');
  return response.json();
}

async function uploadDocument({ fileId, title, htmlContent, parentId }) {
  const boundary = `ficvault_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.document'
  };
  if (!fileId && parentId) metadata.parents = [parentId];

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink';

  const response = await apiFetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody(metadata, htmlContent, boundary)
  });
  if (!response.ok) throw await driveError(response, fileId ? 'Could not update the Google Doc.' : 'Could not create the Google Doc.');
  return response.json();
}

async function connect() {
  ensureClientIdConfigured();
  await getToken({ prompt: 'consent' });
  return { connected: true };
}

async function disconnect() {
  if (accessToken && google?.accounts?.oauth2?.revoke) {
    try { await new Promise(resolve => google.accounts.oauth2.revoke(accessToken, resolve)); } catch (_) {}
  }
  clearToken();
  markAuthorized(false);
  return { connected: false };
}

async function getStatus() {
  ensureClientIdConfigured();
  if (isTokenUsable()) return { connected: true };

  // Re-authenticate silently only if this browser has previously authorized FicVault.
  if (wasAuthorized()) {
    try {
      await getToken({ prompt: 'none' });
      return { connected: true };
    } catch (_) {
      clearToken();
      return { connected: false, needsAuthorization: true };
    }
  }
  return { connected: false, needsAuthorization: true };
}

async function syncFic({ fic, htmlContent, rootFolderName, createShipSubfolders, shipFolderName, forceOverwrite = false }) {
  await getToken({ prompt: 'none' });

  let parentId = await findOrCreateFolder(rootFolderName || 'FicVault Fanfics');
  if (createShipSubfolders && shipFolderName) {
    parentId = await findOrCreateFolder(shipFolderName, parentId);
  }

  let existing = null;
  if (fic.driveFileId) existing = await getFileMetadata(fic.driveFileId);

  if (existing && existing.trashed) existing = null;

  if (existing && !forceOverwrite && fic.driveModifiedTime && existing.modifiedTime !== fic.driveModifiedTime) {
    const error = new Error('The Google Doc was edited outside FicVault. Automatic sync was paused to protect those changes.');
    error.code = 'failed-precondition';
    throw error;
  }

  const result = await uploadDocument({
    fileId: existing ? fic.driveFileId : null,
    title: fic.title || 'Untitled Work',
    htmlContent,
    parentId
  });

  return {
    fileId: result.id,
    webViewLink: result.webViewLink || `https://docs.google.com/document/d/${result.id}/edit`,
    modifiedTime: result.modifiedTime || ''
  };
}

window.FicVaultDrive = {
  connect,
  disconnect,
  getStatus,
  syncFic
};
