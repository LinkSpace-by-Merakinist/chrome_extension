Link Space (MV3)
================

Save and restore collections of tabs as projects. Data is stored locally using Chrome storage.

Quick Start
-----------
- Load the extension in `chrome://extensions` → Enable Developer Mode → Load unpacked → select this folder.
- Click the toolbar icon:
  - Enter a project name → Save Tabs to capture the current window.
  - Click a saved project → opens all its URLs in a new window.
- Settings page lets you manage appearance (theme) and view storage info.

Features
--------
- Create named projects from all tabs in the current window.
- List, open, and delete projects.
- Local storage works out of the box.
 

Files
-----
- `manifest.json` — MV3 manifest.
- `background.js` — service worker; init and keyboard shortcut to quick-save.
- `popup.html`, `popup.js` — main UI for save/open.
- `options.html`, `options.js` — settings and appearance (theme).
- `src/storage.js` — storage helpers.
- `src/providers/` — `local.js`, `gdrive.js`, `onedrive.js`.
- `src/utils/pkce.js` — PKCE helper.

Notes
-----
- You can use the command shortcut `Alt+S` to quick-save the current window.

Security and Privacy
--------------------
- No analytics. Only your configured provider is contacted.
- Revoke access via the provider’s security page at any time.
