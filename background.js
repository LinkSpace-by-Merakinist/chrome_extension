// Linkspace background service worker (MV3, module)
// Minimal handlers: init storage defaults and open projects on command

import { getOpenMap, setOpenMap } from './src/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  // no-op init for now
});

// Reserved for future keyboard commands (none active now)
chrome.commands.onCommand.addListener(async (_command) => {});

// Message bridge (reserved for future background-only tasks)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'ping') {
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === 'track_project_window' && typeof msg.windowId === 'number' && typeof msg.projectId === 'string') {
    queueMicrotask(async () => {
      const map = await getOpenMap();
      map.push({ windowId: msg.windowId, projectId: msg.projectId });
      await setOpenMap(map);
    });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
// No syncing of tab changes; only track the window id for each opened project

chrome.windows.onRemoved.addListener(async (windowId) => {
  const map = await getOpenMap();
  const next = map.filter((m) => m.windowId !== windowId);
  await setOpenMap(next);
});
