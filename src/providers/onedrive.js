// OneDrive provider
// Stores projects in application root as linkspace-projects.json via Microsoft Graph
import { getProjects, saveProjects, getProviderConfig, getTokens, setTokens } from '../storage.js';
import { createVerifierAndChallenge } from '../utils/pkce.js';

const SCOPE = 'offline_access Files.ReadWrite AppFolder User.Read openid profile email';
const FILE_NAME = 'linkspace-projects.json';

async function getCfg() {
  const cfg = await getProviderConfig();
  return cfg.onedrive || { tenant: 'common' };
}

async function getAccessTokenInteractive(interactive = true) {
  const cfg = await getCfg();
  if (!cfg.clientId) throw new Error('OneDrive client ID not configured');
  const redirectUri = chrome.identity.getRedirectURL('onedrive');
  const { verifier, challenge } = await createVerifierAndChallenge();
  const authUrl = new URL(`https://login.microsoftonline.com/${cfg.tenant || 'common'}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const launch = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive });
  const url = new URL(launch);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorization code');

  const tokenRes = await fetch(`https://login.microsoftonline.com/${cfg.tenant || 'common'}/oauth2/v2.0/token`, {
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
  tokens.onedrive = tokenJson;
  await setTokens(tokens);
  return tokenJson.access_token;
}

async function getAccessToken() {
  const tokens = await getTokens();
  const existing = tokens.onedrive;
  if (existing?.access_token) return existing.access_token;
  return getAccessTokenInteractive(true);
}

export async function status() {
  const tokens = await getTokens();
  const at = tokens.onedrive?.access_token;
  if (!at) return { signedIn: false };
  try {
    const r = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${at}` } });
    if (!r.ok) throw new Error();
    const u = await r.json();
    return { signedIn: true, email: u.userPrincipalName || u.mail };
  } catch {
    return { signedIn: false };
  }
}

export async function signIn() { await getAccessTokenInteractive(true); }
export async function signOut() {
  const tokens = await getTokens();
  delete tokens.onedrive; // Microsoft doesn't have a simple revoke endpoint for v2 tokens here
  await setTokens(tokens);
}

async function ensureAppFile(at) {
  // Use App Root special folder (@microsoft.graph.conflictBehavior=replace during upload)
  // Probe file; if missing, create empty
  const probe = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(FILE_NAME)}`, { headers: { Authorization: `Bearer ${at}` } });
  if (probe.status === 200) { const meta = await probe.json(); return meta.id; }
  // Create by uploading minimal content
  const up = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(FILE_NAME)}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: '[]'
  });
  if (!up.ok) throw new Error('Create file failed');
  const meta = await up.json();
  return meta.id;
}

export async function pull() {
  const at = await getAccessToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(FILE_NAME)}:/content`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  if (!resp.ok) return await getProjects();
  const text = await resp.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) { await saveProjects(data); return data; }
  } catch {}
  return await getProjects();
}

export async function push() {
  const at = await getAccessToken();
  await ensureAppFile(at);
  const projects = await getProjects();
  const up = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(FILE_NAME)}:/content?@microsoft.graph.conflictBehavior=replace`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(projects),
  });
  if (!up.ok) throw new Error('Upload failed');
}

