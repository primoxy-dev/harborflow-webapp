import { gitData, jobPath, readJson } from './harborflow.mjs';

export function documentsFolder(data) {
  const base = jobPath({ name: data.vessel, jobNo: data.jobNo, eta: data.eta }, 'General').replace(/\/General$/, '');
  return base + (data.status === 'Cancelled' ? ' cancelled' : '');
}

export function folderMoveEntries(tree, source, target) {
  if (!source.startsWith('Jobs/') || !target.startsWith('Jobs/') || source.includes('..') || target.includes('..') ||
      source === target || source.startsWith(target + '/') || target.startsWith(source + '/')) throw Error('Invalid Job folder move');
  if (tree.some(item => item.path === target || item.path.startsWith(target + '/'))) throw Error('Destination GitHub folder already exists');
  const files = tree.filter(item => item.path.startsWith(source + '/') && item.type !== 'tree');
  if (!files.length) throw Error('Source GitHub folder is empty or missing');
  return files.flatMap(file => [
    { path: target + file.path.slice(source.length), mode: file.mode, type: file.type, sha: file.sha },
    { path: file.path, mode: file.mode, type: file.type, sha: null }
  ]);
}

export async function moveJobFolder(source, target, jobId) {
  if (source === target) return;
  const marker = await readJson(source + '/General/job.json');
  if (marker?.data?.operationJobId !== jobId) {
    const destinationMarker = await readJson(target + '/General/job.json');
    if (destinationMarker?.data?.operationJobId === jobId) return;
    throw Error('Source GitHub folder is not linked to this Job');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await gitData('GET', 'ref/heads/main');
    const head = ref.object?.sha;
    if (!head) throw Error('GitHub main branch is unavailable');
    const commit = await gitData('GET', 'commits/' + head);
    const currentTree = await gitData('GET', 'trees/' + commit.tree.sha + '?recursive=1');
    if (currentTree.truncated) throw Error('GitHub tree is too large to move safely');
    const entries = currentTree.tree || [];
    const sourceMarker = entries.find(item => item.path === source + '/General/job.json');
    if (!sourceMarker) {
      const destinationMarker = entries.find(item => item.path === target + '/General/job.json');
      if (destinationMarker?.sha === marker.sha) return;
      throw Error('Source GitHub folder disappeared during rename');
    }
    if (sourceMarker.sha !== marker.sha) throw Error('Job marker changed during GitHub folder rename');
    const changes = folderMoveEntries(entries, source, target);
    const nextTree = await gitData('POST', 'trees', { base_tree: commit.tree.sha, tree: changes });
    const nextCommit = await gitData('POST', 'commits', {
      message: 'Rename HarborFlow Job folder ' + jobId,
      tree: nextTree.sha,
      parents: [head]
    });
    try {
      await gitData('PATCH', 'refs/heads/main', { sha: nextCommit.sha, force: false });
      return;
    } catch (error) {
      if (error.status !== 422 || attempt === 2) throw error;
    }
  }
  throw Error('GitHub folder changed during rename. Try again.');
}
