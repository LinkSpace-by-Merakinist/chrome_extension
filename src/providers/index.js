import * as local from './local.js';
import * as gdrive from './gdrive.js';
import * as onedrive from './onedrive.js';

const registry = {
  local: { key: 'local', label: 'Local', ...local },
  gdrive: { key: 'gdrive', label: 'Google Drive', ...gdrive },
  onedrive: { key: 'onedrive', label: 'OneDrive', ...onedrive },
};

export function getProviderByKey(key) {
  return registry[key] || registry.local;
}

