import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, generateKeyPairSync, createPublicKey, sign, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Readable } from 'node:stream';
import { canonicalize } from '@tufjs/canonical-json';
import {
  Metadata,
  Root,
  Key,
  Signature,
  Targets,
  Snapshot,
  Timestamp,
  MetaFile,
  TargetFile,
} from '@tufjs/models';
import { decodePackage, validateCatalog, exactKeys } from '@macromaxx/plugin-sdk/contracts';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(JSON.stringify(value));
const identity = (r) => r.manifest.id + '@' + r.manifest.version;
const descriptor = (r) => ({ manifest: r.manifest, sha256: r.sha256, length: r.length });

export function validateRegistry(registry, previous) {
  exactKeys(registry, ['schemaVersion', 'publishers', 'releases']);
  validateCatalog({
    schemaVersion: registry.schemaVersion,
    expires: '2099-01-01T00:00:00.000Z',
    releases: registry.releases,
  });
  if (
    !Array.isArray(registry.publishers) ||
    new Set(registry.publishers.map((p) => p?.id)).size !== registry.publishers.length
  )
    throw new Error('Invalid publisher list.');
  for (const p of registry.publishers) {
    exactKeys(p, ['id', 'name', 'github']);
    if (
      !/^[a-z][a-z0-9-]{0,47}$/.test(p.id) ||
      typeof p.name !== 'string' ||
      p.name.length > 80 ||
      !/^[a-zA-Z0-9-]{1,39}$/.test(p.github)
    )
      throw new Error('Invalid publisher.');
  }
  for (const r of registry.releases)
    if (!registry.publishers.some((p) => p.id === r.manifest.publisher))
      throw new Error('Unknown publisher.');
  if (previous) {
    for (const p of previous.publishers)
      if (!registry.publishers.some((next) => isDeepStrictEqual(next, p)))
        throw new Error('Publisher ownership changes require separate enrollment.');
    for (const old of previous.releases) {
      const next = registry.releases.find((r) => identity(r) === identity(old));
      if (!next) throw new Error('Existing release cannot be removed; revoke it.');
      if (!isDeepStrictEqual(descriptor(next), descriptor(old)))
        throw new Error('Release descriptors are immutable.');
      if (old.status === 'revoked' && next.status !== 'revoked')
        throw new Error('Revocation is permanent.');
    }
  }
  return structuredClone(registry);
}

export async function writeOnce(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await fs.readFile(file)).equals(bytes))
      throw new Error('Immutable object already exists with different bytes.');
  }
}

export async function importPackage(directory, release, bytes) {
  if (bytes.length !== release.length || sha256(bytes) !== release.sha256)
    throw new Error('Package hash/length mismatch.');
  const pkg = decodePackage(bytes);
  if (!isDeepStrictEqual(pkg.manifest, release.manifest))
    throw new Error('Package manifest differs from reviewed release.');
  await writeOnce(path.join(directory, 'quarantine', release.sha256 + '.mmxp'), bytes);
}

function keyFor(privateKey) {
  const publicHex = Buffer.from(
    createPublicKey(privateKey).export({ format: 'jwk' }).x,
    'base64url',
  ).toString('hex');
  const keyData = { keytype: 'ed25519', scheme: 'ed25519', keyval: { public: publicHex } };
  const keyID = sha256(Buffer.from(canonicalize(keyData)));
  return Key.fromJSON(keyID, keyData);
}
function signed(metadata, privateKey) {
  const key = keyFor(privateKey);
  metadata.sign(
    (bytes) =>
      new Signature({ keyID: key.keyID, sig: sign(null, bytes, privateKey).toString('hex') }),
  );
  return metadata;
}
export function createTrust(now = new Date()) {
  const keys = Object.fromEntries(
    ['root', 'targets', 'snapshot', 'timestamp'].map((role) => [
      role,
      generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
    ]),
  );
  const root = new Metadata(
    new Root({
      version: 1,
      specVersion: '1.0.31',
      expires: new Date(+now + 365 * 86400000).toISOString(),
      consistentSnapshot: true,
    }),
  );
  for (const [role, key] of Object.entries(keys)) root.signed.addKey(keyFor(key), role);
  signed(root, keys.root);
  root.verifyDelegate('root', root);
  return { root: root.toJSON(), keys };
}

const targetDiskPath = (directory, target) =>
  path.join(
    directory,
    'targets',
    path.dirname(target.path),
    target.hashes.sha256 + '.' + path.basename(target.path),
  );
const metaFile = (version, bytes) =>
  new MetaFile({ version, length: bytes.length, hashes: { sha256: sha256(bytes) } });

export async function verifyPublicationHistory(directory, root) {
  const read = async (relative) => {
    const file = path.join(directory, relative);
    if ((await fs.stat(file)).size > 5 * 1024 * 1024)
      throw new Error('Publication history exceeds quota.');
    return fs.readFile(file);
  };
  const stateBytes = await read('registry-state.json'),
    previous = JSON.parse(stateBytes);
  if (!Number.isSafeInteger(previous.version) || previous.version < 1)
    throw new Error('Invalid publication history version.');
  const trustedRoot = Metadata.fromJSON('root', root);
  trustedRoot.verifyDelegate('root', trustedRoot);
  const timestamp = Metadata.fromJSON(
    'timestamp',
    JSON.parse(await read('metadata/timestamp.json')),
  );
  trustedRoot.verifyDelegate('timestamp', timestamp);
  const snapshotBytes = await read(`metadata/${previous.version}.snapshot.json`);
  timestamp.signed.snapshotMeta.verify(snapshotBytes);
  const snapshot = Metadata.fromJSON('snapshot', JSON.parse(snapshotBytes));
  trustedRoot.verifyDelegate('snapshot', snapshot);
  const targetsBytes = await read(`metadata/${previous.version}.targets.json`);
  snapshot.signed.meta['targets.json'].verify(targetsBytes);
  const targets = Metadata.fromJSON('targets', JSON.parse(targetsBytes));
  trustedRoot.verifyDelegate('targets', targets);
  if (
    [
      timestamp.signed.version,
      timestamp.signed.snapshotMeta.version,
      snapshot.signed.version,
      snapshot.signed.meta['targets.json'].version,
      targets.signed.version,
    ].some((v) => v !== previous.version)
  )
    throw new Error('Publication history version mismatch.');
  const target = targets.signed.targets['registry-state.json'];
  if (!target) throw new Error('Authenticated previous publication required.');
  await target.verify(Readable.from(stateBytes));
  validateRegistry(previous.registry);
  // Historical metadata may be expired; it is authenticated audit input, not served trust.
  return previous;
}

export async function publishRepository({
  directory,
  previousDirectory,
  registry,
  root,
  keys,
  version,
  now = new Date(),
}) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid metadata version.');
  let previous;
  if (previousDirectory) previous = await verifyPublicationHistory(previousDirectory, root);
  else {
    const exists = await fs.stat(path.join(directory, 'metadata/timestamp.json')).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      },
    );
    if (exists) previous = await verifyPublicationHistory(directory, root);
  }
  if (!previous && version !== 1) throw new Error('Authenticated previous publication required.');
  validateRegistry(registry, previous?.registry);
  if (previous && version !== previous.version + 1)
    throw new Error('Metadata version must increase by exactly one.');
  const trustedRoot = Metadata.fromJSON('root', root);
  trustedRoot.verifyDelegate('root', trustedRoot);
  if (!trustedRoot.signed.consistentSnapshot || trustedRoot.signed.isExpired(now))
    throw new Error('Invalid or expired root.');
  const expires = (days) => new Date(+now + days * 86400000).toISOString();
  const catalog = { schemaVersion: 1, expires: expires(1), releases: registry.releases };
  const stateBytes = json({ version, registry });
  const files = new Map([
    ['catalog.json', json(catalog)],
    ['registry-state.json', stateBytes],
  ]);
  for (const release of registry.releases) {
    if (release.status !== 'approved') continue;
    const bytes = await fs.readFile(path.join(directory, 'quarantine', release.sha256 + '.mmxp'));
    await importPackage(directory, release, bytes);
    files.set(`artifacts/sha256/${release.sha256}.mmxp`, bytes);
  }
  const targets = new Metadata(
    new Targets({ version, specVersion: '1.0.31', expires: expires(7) }),
  );
  for (const [name, bytes] of files)
    targets.signed.addTarget(
      new TargetFile({ path: name, length: bytes.length, hashes: { sha256: sha256(bytes) } }),
    );
  signed(targets, keys.targets);
  trustedRoot.verifyDelegate('targets', targets);
  const targetsBytes = json(targets.toJSON());
  const snapshot = signed(
    new Metadata(
      new Snapshot({
        version,
        specVersion: '1.0.31',
        expires: expires(7),
        meta: { 'targets.json': metaFile(version, targetsBytes) },
      }),
    ),
    keys.snapshot,
  );
  trustedRoot.verifyDelegate('snapshot', snapshot);
  const snapshotBytes = json(snapshot.toJSON());
  const timestamp = signed(
    new Metadata(
      new Timestamp({
        version,
        specVersion: '1.0.31',
        expires: expires(1),
        snapshotMeta: metaFile(version, snapshotBytes),
      }),
    ),
    keys.timestamp,
  );
  trustedRoot.verifyDelegate('timestamp', timestamp);
  for (const target of Object.values(targets.signed.targets))
    await writeOnce(targetDiskPath(directory, target), files.get(target.path));
  await writeOnce(path.join(directory, `metadata/${root.signed.version}.root.json`), json(root));
  await writeOnce(path.join(directory, `metadata/${version}.targets.json`), targetsBytes);
  await writeOnce(path.join(directory, `metadata/${version}.snapshot.json`), snapshotBytes);
  // The timestamp is the commit point: publish immutable targets/snapshot first.
  await atomicWrite(path.join(directory, 'metadata/timestamp.json'), json(timestamp.toJSON()));
  await atomicWrite(path.join(directory, 'registry-state.json'), stateBytes);
  return catalog;
}

async function atomicWrite(file, bytes) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, bytes, { mode: 0o600 });
  await fs.rename(temp, file);
}
