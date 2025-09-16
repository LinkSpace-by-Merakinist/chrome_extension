import { getTheme, setTheme, getProjects, saveProjects } from './src/storage.js';

const $ = (s) => document.querySelector(s);

async function load() {
  await initTheme();
}

document.addEventListener('DOMContentLoaded', async () => {
  await load();

  const themeBtn = $('#themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const bmImport = document.getElementById('bmImport');
  const bmExportAll = document.getElementById('bmExportAll');
  if (bmImport) bmImport.addEventListener('click', async () => { await importFromBookmarksPromptOptions(); });
  if (bmExportAll) bmExportAll.addEventListener('click', async () => { await exportAllProjectsToBookmarks(); });

  await refreshProjectsUI();
});

// ===== Bookmarks bridge for Settings =====
async function getRootFolderIdPreferOther() {
  try { const n = await chrome.bookmarks.get('2'); if (n && n.length) return '2'; } catch {}
  try { const n = await chrome.bookmarks.get('1'); if (n && n.length) return '1'; } catch {}
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
  const parentId = await getOrCreateLinkSpaceFolder();
  const children = await chrome.bookmarks.getChildren(parentId);
  let sub = children.find((c) => !c.url && c.title === project.name);
  if (!sub) {
    sub = await chrome.bookmarks.create({ parentId, title: project.name });
  } else {
    const subChildren = await chrome.bookmarks.getChildren(sub.id);
    await Promise.all(subChildren.map((c) => chrome.bookmarks.remove(c.id)));
  }
  for (const url of project.urls) {
    try { await chrome.bookmarks.create({ parentId: sub.id, title: new URL(url).hostname, url }); } catch {}
  }
}

async function exportAllProjectsToBookmarks() {
  const status = document.getElementById('bmStatus');
  status.textContent = 'Exporting…';
  const projects = await getProjects();
  for (const p of projects) {
    await exportProjectToBookmarks(p);
  }
  status.textContent = `Exported ${projects.length} project(s) to Other Bookmarks → "Link Space".`;
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
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function showFolderPicker() {
  return new Promise(async (resolve) => {
    const folders = await listAllBookmarkFolders();
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

async function importFromBookmarksPromptOptions() {
  const status = document.getElementById('bmStatus');
  const folderId = await showFolderPicker();
  if (!folderId) return;
  status.textContent = 'Importing…';
  const children = await chrome.bookmarks.getChildren(folderId);
  const existing = await getProjects();
  const existingNames = new Set(existing.map((p) => p.name));
  let imported = 0;
  // import selected folder as project if it has direct bookmarks
  const direct = children.filter((n) => n.url).map((n) => n.url);
  if (direct.length) {
    const folder = (await chrome.bookmarks.get(folderId))[0];
    const name = folder?.title || 'Imported';
    if (!existingNames.has(name)) { existing.push({ id: crypto.randomUUID(), name, createdAt: Date.now(), urls: direct }); imported++; }
  }
  // import each subfolder as a project
  for (const f of children.filter((n) => !n.url)) {
    const kids = await chrome.bookmarks.getChildren(f.id);
    const urls = kids.filter((k) => k.url).map((k) => k.url);
    if (!urls.length) continue;
    const name = f.title;
    if (existingNames.has(name)) continue;
    existing.push({ id: crypto.randomUUID(), name, createdAt: Date.now(), urls });
    imported++;
  }
  await saveProjects(existing);
  status.textContent = imported ? `Imported ${imported} project(s) from “${(await chrome.bookmarks.get(folderId))[0]?.title || 'folder'}”.` : 'No new projects found to import.';
}

async function refreshProjectsUI() {
  const list = document.getElementById('projList');
  const empty = document.getElementById('projEmpty');
  if (!list) return;
  list.innerHTML = '';
  const projects = await getProjects();
  if (!projects.length) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  const items = projects.slice().sort((a,b) => b.createdAt - a.createdAt);
  for (const p of items) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHtml(p.name)}</strong><div class="small">${new Date(p.createdAt).toLocaleString()} · ${p.urls.length} tabs</div>`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const exp = document.createElement('button');
    exp.className = 'secondary';
    exp.textContent = 'Export';
    exp.addEventListener('click', async () => {
      await exportProjectToBookmarks(p);
      const s = document.getElementById('bmStatus');
      if (s) s.textContent = `Exported “${p.name}” to Other Bookmarks → "Link Space".`;
    });
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      const next = (await getProjects()).filter(x => x.id !== p.id);
      await saveProjects(next);
      await refreshProjectsUI();
    });
    actions.append(exp, del);
    li.append(left, actions);
    list.appendChild(li);
  }
}

function escapeHtml(s) { return s.replace(/[&<>\"]+/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

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

async function initTheme() {
  const current = await getTheme();
  applyThemeAttr(current);
  updateThemeToggleIcon(current);
}

function updateThemeToggleIcon(theme) {
  const btn = document.querySelector('#themeToggle');
  const eff = theme === 'system' ? effectiveScheme() : theme;
  if (btn) btn.textContent = eff === 'dark' ? '🌞' : '🌙';
}

async function toggleTheme() {
  const current = await getTheme();
  const systemEff = effectiveScheme();
  const base = current === 'system' ? systemEff : current;
  const next = base === 'dark' ? 'light' : 'dark';
  await setTheme(next);
  applyThemeAttr(next);
  updateThemeToggleIcon(next);
}
