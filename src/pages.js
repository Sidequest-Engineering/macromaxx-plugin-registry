import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { Metadata } from '@tufjs/models';
import { importPackage, publishRepository, verifyPublicationHistory, sha256, validateRegistry } from './repository.js';

const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const allowedFile = /^(?:\.nojekyll|index\.html|test\/(?:client-config\.json|registry-state\.json|metadata\/(?:[1-9][0-9]*\.(?:root|targets|snapshot)\.json|timestamp\.json)|targets\/(?:[a-f0-9]{64}\.(?:catalog|registry-state)\.json|artifacts\/sha256\/[a-f0-9]{64}\.[a-f0-9]{64}\.mmxp)))$/;
const allowedDirectory = /^(?:test|test\/metadata|test\/targets|test\/targets\/artifacts|test\/targets\/artifacts\/sha256)$/;

// A previous deployment is untrusted input. Never recursively copy arbitrary files.
export async function staticFiles(directory) {
  const files = new Map();
  let total = 0;
  async function visit(relative = '') {
    const full = path.join(directory, relative);
    const stat = await fs.lstat(full);
    if (stat.isSymbolicLink()) throw new Error('Links are not allowed in a Pages site.');
    if (stat.isDirectory()) {
      if (relative && !allowedDirectory.test(relative)) throw new Error('Unexpected site directory: ' + relative);
      for (const entry of await fs.readdir(full)) await visit(relative ? relative + '/' + entry : entry);
    } else {
      if (!stat.isFile() || !allowedFile.test(relative)) throw new Error('Unexpected site file: ' + relative);
      total += stat.size;
      if (stat.size > 6 * 1024 * 1024 || total > 256 * 1024 * 1024 || files.size >= 10000)
        throw new Error('Pages site exceeds file/size quota.');
      const bytes = await fs.readFile(full);
      // Content-addressed objects must match their names even when no longer current.
      if (relative.startsWith('test/targets/') && sha256(bytes) !== path.basename(relative).split('.')[0])
        throw new Error('Retained target hash mismatch.');
      files.set(relative, bytes);
    }
  }
  await visit();
  return files;
}

export async function preparePagesSite({ inputDirectory, outputDirectory, previousSiteDirectory, keys, baseUrl, allowBootstrap = false }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/'))
    throw new Error('Pages base URL must be an HTTPS directory.');
  const root = await readJSON(path.join(inputDirectory, 'root.json'));
  const registry = await readJSON(path.join(inputDirectory, 'registry.json'));
  validateRegistry(registry);
  let version = 1;
  const retained = previousSiteDirectory ? await staticFiles(previousSiteDirectory) : new Map();
  if (previousSiteDirectory) {
    const previous = await verifyPublicationHistory(path.join(previousSiteDirectory, 'test'), root);
    version = previous.version + 1;
    if (!isDeepStrictEqual(JSON.parse(retained.get(`test/metadata/${root.signed.version}.root.json`)), root))
      throw new Error('Retained root differs from pinned root.');
    const trustedRoot = Metadata.fromJSON('root', root);
    for (const [name, bytes] of retained) {
      const match = /^test\/metadata\/([1-9][0-9]*)\.(targets|snapshot)\.json$/.exec(name);
      if (!match) continue;
      const metadata = Metadata.fromJSON(match[2], JSON.parse(bytes));
      trustedRoot.verifyDelegate(match[2], metadata);
      if (metadata.signed.version !== Number(match[1]) || metadata.signed.version >= version) throw new Error('Invalid retained metadata version.');
      if (match[2] === 'snapshot') {
        const targets = retained.get(`test/metadata/${match[1]}.targets.json`);
        if (!targets) throw new Error('Historical targets missing.');
        metadata.signed.meta['targets.json'].verify(targets);
      }
    }
  } else if (!allowBootstrap) throw new Error('Explicit bootstrap required when publication history is absent.');
  // Never overlay a partly built site, nor mutate the preceding publication.
  await fs.mkdir(outputDirectory, { recursive: false });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-pages-sign-'));
  try {
    for (const [name, bytes] of retained) {
      await fs.mkdir(path.dirname(path.join(outputDirectory, name)), { recursive: true });
      await fs.writeFile(path.join(outputDirectory, name), bytes);
    }
    for (const release of registry.releases) {
      if (release.status === 'approved') {
        const file = path.join(inputDirectory, 'packages', release.sha256 + '.mmxp');
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.size > 6 * 1024 * 1024) throw new Error('Invalid package file.');
        await importPackage(work, release, await fs.readFile(file));
      }
    }
    await publishRepository({ directory: work, previousDirectory: previousSiteDirectory && path.join(previousSiteDirectory, 'test'), registry, root, keys, version });
    // The publisher's quarantine is intentionally excluded from the deployment.
    for (const folder of ['metadata', 'targets']) {
      async function copy(relative = '') {
        const source = path.join(work, folder, relative);
        for (const entry of await fs.readdir(source, { withFileTypes: true })) {
          const name = path.join(relative, entry.name);
          if (entry.isDirectory()) await copy(name);
          else {
            const target = path.join(outputDirectory, 'test', folder, name);
            const bytes = await fs.readFile(path.join(work, folder, name));
            const old = retained.get('test/' + folder + '/' + name);
            if (old && name !== 'timestamp.json' && !old.equals(bytes)) throw new Error('Immutable site file changed.');
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, bytes);
          }
        }
      }
      await copy();
    }
    await fs.copyFile(path.join(work, 'registry-state.json'), path.join(outputDirectory, 'test/registry-state.json'));
    const config = { enabled: true, channel: 'test', metadataUrl: new URL('test/metadata/', base).href, targetsUrl: new URL('test/targets/', base).href, root };
    await fs.writeFile(path.join(outputDirectory, 'test/client-config.json'), JSON.stringify(config, null, 2) + '\n');
    await fs.writeFile(path.join(outputDirectory, '.nojekyll'), '');
    await fs.writeFile(path.join(outputDirectory, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>MacroMaxx test plugin store</title><h1>MacroMaxx test plugin store</h1><p>Signed test channel for the MacroMaxx app. Not a production trust authority.</p><p>Configure the app with its independently pinned public test root. Never trust a root merely because it was downloaded here.</p></html>\n');
    await staticFiles(outputDirectory);
    await verifyPublicationHistory(path.join(outputDirectory, 'test'), root);
    return { version };
  } finally { await fs.rm(work, { recursive: true, force: true }); }
}
