import { getProjects, saveProjects, getTheme, getOpenMap } from './src/storage.js';

const $ = (sel) => document.querySelector(sel);

async function refreshList() {
  const listEl = $('#projects');
  const activeEl = $('#activeProjects');
  const emptyEl = $('#empty');
  listEl.innerHTML = '';
  if (activeEl) activeEl.innerHTML = '';
  const projects = await getProjects();
  const openMap = await getOpenMap();
  const activeIds = new Set(openMap.map(m => m.projectId));
  if (!projects || projects.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const byTime = projects.slice().sort((a, b) => b.createdAt - a.createdAt);
  const active = byTime.filter(p => activeIds.has(p.id));
  const rest = byTime.filter(p => !activeIds.has(p.id));

  const renderItem = (p) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const isActive = activeIds.has(p.id);
    left.innerHTML = `<span class="status-dot ${isActive ? 'status-on' : 'status-off'}" title="${isActive ? 'Active' : 'Closed'}"></span><strong>${escapeHtml(p.name)}</strong><div class="small">${new Date(p.createdAt).toLocaleString()} · ${p.urls.length} tabs</div>`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'secondary';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openProject(p));
    const closeBtn = document.createElement('button');
    closeBtn.className = 'danger icon-button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close window';
    if (!isActive) { closeBtn.disabled = true; closeBtn.title = 'Project not open'; }
    closeBtn.addEventListener('click', async () => {
      try {
        if (!confirm(`Close the window for "${p.name}"?`)) return;
        const map = await getOpenMap();
        const entry = map.find(m => m.projectId === p.id);
        if (entry && typeof entry.windowId === 'number') {
          await chrome.windows.remove(entry.windowId);
          await refreshList();
        }
      } catch {}
    });
    actions.append(openBtn, closeBtn);
    li.append(left, actions);
    return li;
  };

  if (active.length) {
    for (const p of active) listEl.appendChild(renderItem(p));
  }
  for (const p of rest) listEl.appendChild(renderItem(p));
}

function escapeHtml(s) { return s.replace(/[&<>"]+/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

async function openProject(project) {
  if (!project || !project.urls || project.urls.length === 0) return;
  // If project already open, focus that window instead of opening another
  try {
    const map = await getOpenMap();
    const entry = map.find((m) => m.projectId === project.id);
    if (entry && typeof entry.windowId === 'number') {
      try {
        await chrome.windows.update(entry.windowId, { focused: true });
        return;
      } catch {
        // window may be gone; fall through to create
      }
    }
  } catch {}
  const win = await chrome.windows.create({ url: project.urls, focused: true, state: 'maximized' });
  if (win?.id) {
    chrome.runtime.sendMessage({ type: 'track_project_window', windowId: win.id, projectId: project.id });
  }
}

async function saveCurrentWindowAsProject(name) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs.filter(t => !t.pinned && !!t.url && !t.url.startsWith('chrome')).map(t => t.url);
  if (urls.length === 0) return;
  const projects = await getProjects();
  const id = crypto.randomUUID();
  const project = { id, name: name || `Project ${new Date().toLocaleString()}`, createdAt: Date.now(), urls };
  projects.push(project);
  await saveProjects(projects);
  await pushToProvider();
  await refreshList();
}

async function pushToProvider() { /* local only; no sync */ }

async function initProviderLabel() { $('#providerLabel').textContent = 'Local'; }

function applyThemeAttr(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

function effectiveScheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  return mq.matches ? 'dark' : 'light';
}

async function initTheme() { const current = await getTheme(); applyThemeAttr(current); }

document.addEventListener('DOMContentLoaded', async () => {
  $('#saveBtn').addEventListener('click', async () => {
    const name = $('#projectName').value.trim();
    await saveCurrentWindowAsProject(name);
    $('#projectName').value = '';
  });
  $('#optionsLink').addEventListener('click', () => chrome.runtime.openOptionsPage());
  const importLink = document.getElementById('importLink');
  if (importLink) importLink.addEventListener('click', async (e) => { e.preventDefault(); await importFromBookmarksPrompt(); });
  await initTheme();
  await initProviderLabel();
  await refreshList();
});

// ============ Bookmarks bridge ============
async function getRootFolderIdPreferOther() {
  try { const n = await chrome.bookmarks.get('2'); if (n && n.length) return '2'; } catch {}
  try { const n = await chrome.bookmarks.get('1'); if (n && n.length) return '1'; } catch {}
  // fallback to first root
  const tree = await chrome.bookmarks.getTree();
  return tree?.[0]?.children?.[0]?.id || '1';
}

async function getOrCreateLinkSpaceFolder() {
  const candidates = await chrome.bookmarks.search({ title: 'Link Space' });
  const folder = candidates.find((n) => !n.url && n.title === 'Link Space');
  if (folder) return folder.id;
  const parentId = await getRootFolderIdPreferOther();
  const created = await chrome.bookmarks.create({ parentId, title: 'Link Space' });
  return created.id;
}

async function exportProjectToBookmarks(project) {
  if (!project) return;
  const parentId = await getOrCreateLinkSpaceFolder();
  // Check for existing subfolder with same name
  const children = await chrome.bookmarks.getChildren(parentId);
  let sub = children.find((c) => !c.url && c.title === project.name);
  if (!sub) {
    sub = await chrome.bookmarks.create({ parentId, title: project.name });
  } else {
    // clear existing children
    const subChildren = await chrome.bookmarks.getChildren(sub.id);
    await Promise.all(subChildren.map((c) => chrome.bookmarks.remove(c.id)));
  }
  // Create bookmarks for each URL
  for (const url of project.urls) {
    await chrome.bookmarks.create({ parentId: sub.id, title: new URL(url).hostname, url });
  }
}

async function listAllBookmarkFolders() {
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  function walk(nodes, path) {
    for (const n of nodes) {
      const nextPath = path ? `${path}/${n.title || ''}` : (n.title || '');
      if (!n.url) {
        if (n.title) out.push({ id: n.id, path: nextPath });
        if (n.children) walk(n.children, nextPath);
      }
    }
  }
  walk(tree, '');
  // De-dup and sort by path length then alpha
  const dedup = [];
  const seen = new Set();
  for (const f of out) { if (!seen.has(f.id)) { seen.add(f.id); dedup.push(f); } }
  dedup.sort((a, b) => a.path.localeCompare(b.path));
  return dedup;
}

function showFolderPicker(folders) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-panel">
        <div class="card stack">
          <label for="folderSelect">Choose bookmarks folder</label>
          <select id="folderSelect"></select>
          <div class="modal-actions">
            <button id="cancelPick" class="secondary">Cancel</button>
            <button id="confirmPick">Import</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const sel = modal.querySelector('#folderSelect');
    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = f.id; opt.textContent = f.path || '(root)';
      sel.appendChild(opt);
    }
    modal.querySelector('#cancelPick').addEventListener('click', () => { modal.remove(); resolve(null); });
    modal.querySelector('#confirmPick').addEventListener('click', () => { const v = sel.value; modal.remove(); resolve(v); });
    modal.querySelector('.modal-backdrop').addEventListener('click', () => { modal.remove(); resolve(null); });
  });
}

async function importFromBookmarksPrompt() {
  const folders = await listAllBookmarkFolders();
  if (!folders.length) return;
  const id = await showFolderPicker(folders);
  if (!id) return;
  await importFolderAsProjects(id);
}

async function importFolderAsProjects(parentId) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = await getProjects();
  const existingNames = new Set(existing.map((p) => p.name));

  // If folder has direct bookmark children, import as a project too
  const directUrls = children.filter((n) => n.url).map((n) => n.url);
  if (directUrls.length) {
    const parent = (await chrome.bookmarks.get(parentId))[0];
    const name = parent?.title || 'Imported';
    if (!existingNames.has(name)) {
      existing.push({ id: crypto.randomUUID(), name, createdAt: Date.now(), urls: directUrls });
      existingNames.add(name);
    }
  }
  // Import each immediate subfolder as a project
  for (const f of children.filter((n) => !n.url)) {
    const kids = await chrome.bookmarks.getChildren(f.id);
    const urls = kids.filter((k) => k.url).map((k) => k.url);
    if (!urls.length) continue;
    const name = f.title;
    if (existingNames.has(name)) continue;
    existing.push({ id: crypto.randomUUID(), name, createdAt: Date.now(), urls });
  }
  await saveProjects(existing);
  await refreshList();
}
