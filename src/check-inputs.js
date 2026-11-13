import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry } from './repository.js';
import { releaseAssetURL } from './source.js';

export async function readFormattedJSON(file, maxBytes = 5 * 1024 * 1024) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('Expected a bounded regular JSON file: ' + file);
  const text = await fs.readFile(file, 'utf8');
  const value = JSON.parse(text);
  if (text !== JSON.stringify(value, null, 2) + '\n')
    throw new Error('JSON formatting: use two-space indentation and a final newline: ' + file);
  return value;
}

export async function validatePublicationInputs({ registry, sourceDirectory }) {
  validateRegistry(registry);
  const expected = new Set(registry.releases.map(release => release.sha256 + '.json'));
  for (const entry of await fs.readdir(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || (entry.name !== 'README.md' && !expected.has(entry.name)))
      throw new Error('Unexpected source file: ' + entry.name);
  }
  for (const release of registry.releases) {
    const source = await readFormattedJSON(path.join(sourceDirectory, release.sha256 + '.json'), 4096);
    releaseAssetURL(source, release.manifest.version);
  }
  return registry.releases.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const registry = await readFormattedJSON(process.argv[2] || 'registry.json');
    const count = await validatePublicationInputs({ registry, sourceDirectory: process.argv[3] || 'sources' });
    console.log(`Registry and pinned sources valid: ${count} releases.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
