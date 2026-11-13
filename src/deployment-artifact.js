import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { allowedStaticPath, staticFiles } from './pages.js';
import { publicationIdentity } from './health.js';
import { assertLivePublication } from './release-gates.js';
import { renderLanding } from './landing.js';

export async function verifyDeploymentTar({ archive, outputDirectory, root, historyDirectory, kind }) {
  const tar = args => execFileSync('tar', args, { maxBuffer: 7 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const names = tar(['-tf', archive, '--quoting-style=escape']).toString().trim().split('\n');
  const rows = tar(['-tvf', archive, '--numeric-owner', '--quoting-style=escape']).toString().trim().split('\n');
  if (names.length > 10000 || names.length !== rows.length) throw new Error('Pages archive quota/entry mismatch.');
  let total = 0;
  const files = [], seen = new Set();
  for (let index = 0; index < names.length; index++) {
    const original = names[index], relative = original.replace(/^\.\//, '').replace(/\/$/, '');
    const type = rows[index][0], size = Number(rows[index].split(/\s+/)[2]);
    if (!['-', 'd'].includes(type) || !allowedStaticPath(relative, type === 'd') || seen.has(relative) || !Number.isSafeInteger(size) || size < 0 || size > 6 * 1024 * 1024)
      throw new Error('Unexpected Pages archive file/link/path.');
    seen.add(relative); total += size;
    if (total > 256 * 1024 * 1024) throw new Error('Pages archive size quota exceeded.');
    if (type === '-') files.push({ original, relative, size });
  }
  await fs.mkdir(outputDirectory);
  // Never extract a tar into the filesystem: read individually validated regular
  // entries to stdout and write only allowlisted paths ourselves.
  for (const file of files) {
    const bytes = tar(['-xOf', archive, '--', file.original]);
    if (bytes.length !== file.size) throw new Error('Pages archive length mismatch.');
    const target = path.join(outputDirectory, file.relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
  }
  const actual = await staticFiles(outputDirectory);
  if (kind === 'pending') {
    if (actual.size !== 2 || actual.get('.nojekyll')?.length !== 0 || actual.get('index.html')?.toString() !== renderLanding({ releases: [] }, { active: false }))
      throw new Error('Pending deployment contains unexpected active contents.');
  } else {
    if (kind !== 'signed' || !historyDirectory) throw new Error('Missing authoritative deployment history.');
    assertLivePublication(await publicationIdentity(outputDirectory, root), await publicationIdentity(historyDirectory, root));
    const expected = await staticFiles(historyDirectory);
    if (actual.size !== expected.size || [...expected].some(([name, bytes]) => !actual.get(name)?.equals(bytes)))
      throw new Error('Pages artifact differs from the current authoritative publication.');
  }
  return true;
}
