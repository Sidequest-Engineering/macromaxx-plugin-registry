import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { staticFiles } from './pages.js';

export const HISTORY_BRANCH = 'production-publication';

const git = (args, cwd, input) => execFileSync('git', args, {
  cwd, input, maxBuffer: 300 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env.GH_TOKEN ? { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + process.env.GH_TOKEN).toString('base64') } : process.env,
});

export async function exportHistory({ repositoryDirectory, commit, outputDirectory }) {
  // Validate all tree entries before writing anything. No archive extraction or symlinks.
  const entries = git(['ls-tree', '-rz', '--full-tree', commit], repositoryDirectory).toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if (!match || match[2].split('/').some(p => !p || p === '.' || p === '..' || p === '.git') || match[2].includes('\\'))
      throw new Error('Unexpected Git file mode/path (links are forbidden).');
    return { hash: match[1], name: match[2] };
  });
  if (entries.length > 10000) throw new Error('History file quota exceeded.');
  await fs.mkdir(outputDirectory, { recursive: false });
  let total = 0;
  for (const entry of entries) {
    const size = Number(git(['cat-file', '-s', entry.hash], repositoryDirectory).toString());
    total += size;
    if (size > 6 * 1024 * 1024 || total > 256 * 1024 * 1024) throw new Error('History size quota exceeded.');
    const file = path.join(outputDirectory, entry.name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, git(['cat-file', 'blob', entry.hash], repositoryDirectory));
  }
  await staticFiles(outputDirectory);
  const state = JSON.parse(await fs.readFile(path.join(outputDirectory, 'registry-state.json')));
  const count = Number(git(['rev-list', '--first-parent', '--count', commit], repositoryDirectory).toString());
  const merges = git(['rev-list', '--min-parents=2', '--max-count=1', commit], repositoryDirectory).toString().trim();
  // One linear commit per metadata version. A fast-forward replay of an older,
  // still correctly signed publication must not reset the signing counter.
  if (!Number.isSafeInteger(state.version) || state.version !== count || merges)
    throw new Error('Publication history rollback/version continuity failure.');
}

export async function publishHistory({ siteDirectory, remote, previousCommit }) {
  const files = await staticFiles(siteDirectory);
  if (previousCommit !== null && !/^[a-f0-9]{40}$/.test(previousCommit)) throw new Error('Invalid previous commit.');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-pages-git-'));
  try {
    git(['init', '--initial-branch=' + HISTORY_BRANCH], work);
    git(['remote', 'add', 'origin', remote], work);
    const current = git(['ls-remote', '--heads', 'origin', 'refs/heads/' + HISTORY_BRANCH], work).toString().trim().split(/\s+/)[0] || null;
    if (current !== previousCommit) throw new Error('Publication history changed; refusing bootstrap/race.');
    if (current) {
      git(['fetch', '--no-tags', 'origin', 'refs/heads/' + HISTORY_BRANCH], work);
      if (git(['rev-parse', 'FETCH_HEAD'], work).toString().trim() !== current) throw new Error('Publication history race.');
      git(['checkout', '-B', HISTORY_BRANCH, 'FETCH_HEAD'], work);
      const oldSite = path.join(work, 'old-site');
      await exportHistory({ repositoryDirectory: work, commit: current, outputDirectory: oldSite });
      const oldFiles = await staticFiles(oldSite);
      for (const [name, bytes] of oldFiles) {
        if (!files.has(name)) throw new Error('Publication removed retained history.');
        if (/^(metadata\/[0-9]+\.|targets\/)/.test(name) && !files.get(name).equals(bytes))
          throw new Error('Publication changed immutable history.');
      }
      await fs.rm(oldSite, { recursive: true });
    }
    for (const [name, bytes] of files) {
      await fs.mkdir(path.dirname(path.join(work, name)), { recursive: true });
      await fs.writeFile(path.join(work, name), bytes, { mode: 0o644 });
    }
    git(['add', '--all'], work);
    git(['-c', 'user.name=MacroMaxx registry', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Publish signed production registry'], work);
    // A normal push rejects any concurrent change; never use --force.
    git(['push', 'origin', 'HEAD:refs/heads/' + HISTORY_BRANCH], work);
    return git(['rev-parse', 'HEAD'], work).toString().trim();
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
