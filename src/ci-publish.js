import fs from 'node:fs/promises';
import { publishRepository, sha256 } from './repository.js';
const version = Number(process.env.METADATA_VERSION);
const keys = {
  targets: process.env.TARGETS_PRIVATE_KEY,
  snapshot: process.env.SNAPSHOT_PRIVATE_KEY,
  timestamp: process.env.TIMESTAMP_PRIVATE_KEY,
};
if (Object.values(keys).some((key) => !key))
  throw new Error(
    'Configure separate protected-environment online keys; no root private key is used.',
  );
const registry = JSON.parse(await fs.readFile('registry.json'));
const input = JSON.parse(await fs.readFile('public/publication-input.json'));
if (input.registrySha256 !== sha256(Buffer.from(JSON.stringify(registry))))
  throw new Error('Publication import does not match reviewed registry.');
await publishRepository({
  directory: 'public',
  previousDirectory: process.env.PREVIOUS_RUN_ID ? 'previous' : undefined,
  registry,
  root: JSON.parse(await fs.readFile('root.json')),
  keys,
  version,
});
