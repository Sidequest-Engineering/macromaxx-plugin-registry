import fs from 'node:fs/promises';
import path from 'node:path';
import { exactKeys } from '@macromaxx/plugin-sdk/contracts';
import { validateRegistry, importPackage, sha256, verifyPublicationHistory } from './repository.js';

export function releaseAssetURL(source, version) {
  exactKeys(source, ['repository', 'tag', 'asset', 'commit']);
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(source.repository) ||
    source.tag !== 'v' + version ||
    !/^[A-Za-z0-9_.-]{1,120}\.mmxp$/.test(source.asset) ||
    !/^[a-f0-9]{40}$/.test(source.commit)
  )
    throw new Error('Invalid pinned release source.');
  return `${source.repository}/releases/download/${source.tag}/${source.asset}`;
}

export async function fetchReviewedReleases(registry, sourceDirectory, output, previousDirectory, root) {
  const previous = previousDirectory ? await verifyPublicationHistory(previousDirectory, root) : undefined;
  validateRegistry(registry, previous?.registry);
  for (const release of registry.releases) {
    if (release.status !== 'approved') continue;
    if (previous?.registry.releases.some(old => old.sha256 === release.sha256 && old.status === 'approved')) {
      const retained = path.join(previousDirectory, 'targets/artifacts/sha256', `${release.sha256}.${release.sha256}.mmxp`);
      if ((await fs.stat(retained)).size !== release.length) throw new Error('Retained artifact length mismatch.');
      await importPackage(output, release, await fs.readFile(retained));
      continue;
    }
    const sourceFile = path.join(sourceDirectory, release.sha256 + '.json');
    if ((await fs.stat(sourceFile)).size > 4096) throw new Error('Source descriptor too large.');
    const source = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
    let url = new URL(releaseAssetURL(source, release.manifest.version)),
      response;
    for (let hop = 0; hop < 5; hop++) {
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !(url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'))
      )
        throw new Error('Unexpected release redirect.');
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        url = new URL(response.headers.get('location'), url);
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body) throw new Error('Release asset unavailable.');
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > release.length) throw new Error('Release asset exceeds reviewed length.');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    await importPackage(output, release, Buffer.concat(chunks));
  }
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, 'publication-input.json'),
    JSON.stringify({
      schemaVersion: 1,
      registrySha256: sha256(Buffer.from(JSON.stringify(registry))),
      packages: registry.releases
        .filter((r) => r.status === 'approved')
        .map((r) => r.sha256)
        .sort(),
    }),
  );
}
