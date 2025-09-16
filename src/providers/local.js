// Local provider uses chrome.storage.local only
import { getProjects, saveProjects } from '../storage.js';

export async function status() {
  return { signedIn: true, label: 'Local' };
}

export async function pull() {
  // no-op; projects are already local
  return getProjects();
}

export async function push() {
  // no-op; projects are already local
  const projects = await getProjects();
  await saveProjects(projects);
}

