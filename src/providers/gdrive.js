// Google Drive provider
// Stores projects in Drive App Data folder in a single JSON file: linkspace-projects.json
import { getProjects, saveProjects, getProviderConfig, getTokens, setTokens } from '../storage.js';
import { createVerifierAndChallenge } from '../utils/pkce.js';

const FILE_NAME = 'linkspace-projects.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email openid';

async function getCfg() {
  const cfg = await getProviderConfig();
  return cfg.gdrive || {};
}

async function getAccessTokenInteractive(interactive = true) {
  const cfg = await getCfg();
  if (!cfg.clientId) throw new Error('Google Drive client ID not configured');
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const { verifier, challenge } = await createVerifierAndChallenge();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const launch = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive });
  const url = new URL(launch);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorization code');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
  const tokenJson = await tokenRes.json();
  const tokens = await getTokens();
  tokens.gdrive = tokenJson;
  await setTokens(tokens);
  return tokenJson.access_token;
}

async function getAccessToken() {
  const tokens = await getTokens();
  const existing = tokens.gdrive;
  if (existing?.access_token) return existing.access_token;
  return getAccessTokenInteractive(true);
}

export async function status() {
  const tokens = await getTokens();
  const access = tokens.gdrive?.access_token;
  if (!access) return { signedIn: false };
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${access}` } });
    if (!r.ok) throw new Error('Auth failed');
    const u = await r.json();
    return { signedIn: true, email: u.email };
  } catch {
    return { signedIn: false };
  }
}

export async function signIn() {
  await getAccessTokenInteractive(true);
}

export async function signOut() {
  const tokens = await getTokens();
  const at = tokens.gdrive?.access_token;
  if (at) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(at)}`, { method: 'POST' }); } catch {}
  }
  delete tokens.gdrive;
  await setTokens(tokens);
}

async function ensureFile(accessToken) {
  // Search for file in appDataFolder
  const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%20%3D%20%27' + encodeURIComponent(FILE_NAME) + '%27%20and%20trashed%20%3D%20false&spaces=appDataFolder&fields=files(id,name)', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!search.ok) throw new Error('Drive search failed');
  const s = await search.json();
  if (s.files?.length) return s.files[0].id;
  // Create
  const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    closeDelim;
  const create = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!create.ok) throw new Error('Drive create failed');
  const cj = await create.json();
  return cj.id;
}

export async function pull() {
  const access = await getAccessToken();
  // Find file
  const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%20%3D%20%27' + encodeURIComponent(FILE_NAME) + '%27%20and%20trashed%20%3D%20false&spaces=appDataFolder&fields=files(id,name)', { headers: { Authorization: `Bearer ${access}` } });
  if (!search.ok) throw new Error('Drive search failed');
  const s = await search.json();
  if (!s.files?.length) return await getProjects();
  const id = s.files[0].id;
  const content = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${access}` } });
  if (!content.ok) throw new Error('Drive read failed');
  const data = await content.json();
  if (Array.isArray(data)) {
    await saveProjects(data);
    return data;
  }
  return await getProjects();
}

export async function push() {
  const access = await getAccessToken();
  const id = await ensureFile(access);
  const projects = await getProjects();
  const body = JSON.stringify(projects);
  const upload = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body,
  });
  if (!upload.ok) throw new Error('Drive upload failed');
}

