#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createTrust,
  validateRegistry,
  importPackage,
  publishRepository,
  sha256,
} from './repository.js';
import { decodePackage } from '@macromaxx/plugin-sdk/contracts';
import { fetchReviewedReleases } from './source.js';

const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate') {
    const registry = await read(args[0] || 'registry.json');
    validateRegistry(registry, args[1] ? await read(args[1]) : undefined);
    console.log(`Valid registry: ${registry.releases.length} releases.`);
  } else if (command === 'request') {
    const bytes = await fs.readFile(args[0]);
    const pkg = decodePackage(bytes);
    console.log(
      JSON.stringify(
        { manifest: pkg.manifest, sha256: sha256(bytes), length: bytes.length, status: 'approved' },
        null,
        2,
      ),
    );
  } else if (command === 'import') {
    const [registryFile, packageFile, directory] = args;
    const registry = validateRegistry(await read(registryFile));
    const bytes = await fs.readFile(packageFile);
    const release = registry.releases.find((r) => r.sha256 === sha256(bytes));
    if (!release) throw new Error('Package not present in reviewed registry.');
    await importPackage(directory, release, bytes);
    console.log('Imported reviewed bytes into quarantine.');
  } else if (command === 'fetch') {
    const [registryFile, sourceDirectory, output, previousDirectory, rootFile] = args;
    await fetchReviewedReleases(await read(registryFile), sourceDirectory, output, previousDirectory, previousDirectory ? await read(rootFile) : undefined);
    console.log('Fetched and verified exact reviewed release assets.');
  } else if (command === 'init') {
    const [keyDirectory, rootFile] = args;
    if (
      !keyDirectory ||
      !path.isAbsolute(keyDirectory) ||
      path.resolve(keyDirectory).startsWith(process.cwd() + path.sep) ||
      !rootFile
    )
      throw new Error(
        'Usage: init <absolute-private-key-directory-outside-repo> <public-root.json>',
      );
    const trust = createTrust();
    await fs.mkdir(keyDirectory, { recursive: true, mode: 0o700 });
    for (const [role, key] of Object.entries(trust.keys))
      await fs.writeFile(path.join(keyDirectory, role + '.pem'), key, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(rootFile, JSON.stringify(trust.root, null, 2), { flag: 'wx' });
    console.log('Created four separate role keys. Move root.pem OFFLINE; never put it in CI.');
  } else if (command === 'publish') {
    const [registryFile, rootFile, keyDirectory, directory, version, previousDirectory] = args;
    const keys = Object.fromEntries(
      await Promise.all(
        ['targets', 'snapshot', 'timestamp'].map(async (role) => [
          role,
          await fs.readFile(path.join(keyDirectory, role + '.pem'), 'utf8'),
        ]),
      ),
    );
    await publishRepository({
      directory,
      previousDirectory,
      registry: await read(registryFile),
      root: await read(rootFile),
      keys,
      version: Number(version),
    });
    console.log(
      'Signed publication prepared. Upload immutable objects first, timestamp.json last.',
    );
  } else
    throw new Error(
      'Usage: cli.js validate [registry.json] [previous.json] | request <package> | import <registry> <package> <output> | init <private-key-dir> <root.json> | publish <registry> <root> <online-key-dir> <output> <metadata-version>',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
