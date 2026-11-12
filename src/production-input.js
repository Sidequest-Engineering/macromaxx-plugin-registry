import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sha256, validateRegistry } from './repository.js';
import { readFormattedJSON } from './check-inputs.js';
import { REGISTRY_REPOSITORY } from './governance.js';
import { rootFingerprint, verifyAuditReceipt } from './release-gates.js';
import { staticFiles } from './pages.js';

export { rootFingerprint } from './release-gates.js';

export function assertSigningPreflight({ repository, ref, root, custodySha256, audit, revision, runId, runAttempt, now }) {
  if (repository !== REGISTRY_REPOSITORY || ref !== 'refs/heads/main') throw new Error('Production signing requires the canonical repository protected main.');
  if (!custodySha256 || custodySha256 !== rootFingerprint(root)) throw new Error('Operator-confirmed offline root custody/backup is required for this exact root.');
  verifyAuditReceipt(audit, { repository, revision, runId, runAttempt, rootSha256: rootFingerprint(root), now });
  return true;
}

export async function validateTransfer({ directory, registry, root }) {
  validateRegistry(registry);
  const files = new Set(['registry.json', 'root.json', 'publication-input.json', 'previous-commit.json', 'packages', 'previous-site']);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!files.has(entry.name) || (entry.isDirectory() ? !['packages', 'previous-site'].includes(entry.name) : !entry.isFile() || ['packages', 'previous-site'].includes(entry.name)))
      throw new Error('Unexpected publication input file.');
  }
  if (!isDeepStrictEqual(await readFormattedJSON(path.join(directory, 'registry.json')), registry) || !isDeepStrictEqual(await readFormattedJSON(path.join(directory, 'root.json')), root))
    throw new Error('Publication input differs from protected-main registry/root.');
  const inputFile = path.join(directory, 'publication-input.json');
  if (!(await fs.lstat(inputFile)).isFile() || (await fs.stat(inputFile)).size > 5 * 1024 * 1024) throw new Error('Invalid transfer input.');
  const input = JSON.parse(await fs.readFile(inputFile));
  const packages = registry.releases.filter(release => release.status === 'approved');
  if (input.schemaVersion !== 1 || input.registrySha256 !== sha256(Buffer.from(JSON.stringify(registry))) || !isDeepStrictEqual(input.packages, packages.map(r => r.sha256).sort()))
    throw new Error('Publication input digest/packages do not match the reviewed registry.');
  const entries = await fs.readdir(path.join(directory, 'packages'), { withFileTypes: true }).catch(error => {
    // Artifact transport does not preserve empty directories.
    if (error.code === 'ENOENT' && packages.length === 0) return [];
    throw error;
  });
  if (entries.length !== packages.length || entries.some(entry => !entry.isFile() || !packages.some(r => entry.name === r.sha256 + '.mmxp')))
    throw new Error('Unexpected or missing reviewed package input.');
  for (const release of packages) {
    const file = path.join(directory, 'packages', release.sha256 + '.mmxp');
    if ((await fs.stat(file)).size !== release.length || sha256(await fs.readFile(file)) !== release.sha256)
      throw new Error('Reviewed package input hash/length mismatch.');
  }
  const commitFile = path.join(directory, 'previous-commit.json');
  if (!(await fs.lstat(commitFile)).isFile() || (await fs.stat(commitFile)).size > 100) throw new Error('Invalid previous history input.');
  const commit = JSON.parse(await fs.readFile(commitFile));
  if (commit !== null && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid previous history commit.');
  const hasPrevious = await fs.lstat(path.join(directory, 'previous-site')).then(stat => stat.isDirectory() && !stat.isSymbolicLink(), error => { if (error.code === 'ENOENT') return false; throw error; });
  if (!!commit !== hasPrevious) throw new Error('Previous history input does not match its commit.');
  if (hasPrevious) await staticFiles(path.join(directory, 'previous-site'));
  return true;
}
