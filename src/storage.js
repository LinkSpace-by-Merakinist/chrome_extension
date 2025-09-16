// Simple storage helpers for Linkspace

const PROJECTS_KEY = 'linkspace:projects:v1';
const PROVIDER_CFG_KEY = 'linkspace:provider:config:v1';
const TOKENS_KEY = 'linkspace:tokens:v1';
const THEME_KEY = 'linkspace:ui:theme:v1'; // 'light' | 'dark' | 'system'
const OPEN_MAP_KEY = 'linkspace:openMap:v1'; // [{ windowId, projectId }]

export async function getProjects() {
  const data = await chrome.storage.local.get(PROJECTS_KEY);
  return data[PROJECTS_KEY] || [];
}

export async function saveProjects(projects) {
  await chrome.storage.local.set({ [PROJECTS_KEY]: projects });
}

export async function getProviderConfig() {
  const data = await chrome.storage.local.get(PROVIDER_CFG_KEY);
  return data[PROVIDER_CFG_KEY] || { selected: 'local', gdrive: {}, onedrive: {} };
}

export async function setProviderConfig(cfg) {
  await chrome.storage.local.set({ [PROVIDER_CFG_KEY]: cfg });
}

export async function getTokens() {
  const data = await chrome.storage.local.get(TOKENS_KEY);
  return data[TOKENS_KEY] || {};
}

export async function setTokens(tokens) {
  await chrome.storage.local.set({ [TOKENS_KEY]: tokens });
}

export async function getTheme() {
  const data = await chrome.storage.local.get(THEME_KEY);
  return data[THEME_KEY] || 'system';
}

export async function setTheme(theme) {
  const allowed = ['light', 'dark', 'system'];
  const value = allowed.includes(theme) ? theme : 'system';
  await chrome.storage.local.set({ [THEME_KEY]: value });
}

export async function getOpenMap() {
  const data = await chrome.storage.local.get(OPEN_MAP_KEY);
  return data[OPEN_MAP_KEY] || [];
}

export async function setOpenMap(map) {
  await chrome.storage.local.set({ [OPEN_MAP_KEY]: Array.isArray(map) ? map : [] });
}
