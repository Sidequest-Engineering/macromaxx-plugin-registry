import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { probeRegistry, assessSoak, deliverAlert, monitorAuthority } from './monitor.js';
import { rootFingerprint } from './release-gates.js';
import { exportHistory } from './pages-history.js';
import { REGISTRY_REPOSITORY } from './governance.js';

const baseUrl = 'https://sidequest-engineering.github.io/macromaxx-plugin-registry/';
let lock, lockFile, work;
try {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !['probe', 'soak', 'alert-test'].includes(command)) throw new Error('Usage: monitor-cli.js probe | soak | alert-test');
  const notify = payload => deliverAlert({ url: process.env.MONITOR_WEBHOOK_URL, token: process.env.MONITOR_WEBHOOK_TOKEN, payload });
  if (command === 'alert-test') {
    await notify({ service: 'macromaxx-registry', kind: 'operator-alert-test', observedAt: Date.now(), message: 'Confirm this notification arrived at the actual operator destination; HTTP success alone is not proof of receipt.' });
    console.log('Test notification accepted by receiver; operator must confirm actual receipt.');
  } else {
    const rootPath = process.env.MONITOR_ROOT_FILE || 'root.json';
    const stat = await fs.lstat(rootPath);
    if (!stat.isFile() || stat.size > 512 * 1024) throw new Error('Invalid pinned public root file.');
    const root = JSON.parse(await fs.readFile(rootPath));
    if (!/^[a-f0-9]{64}$/.test(process.env.MONITOR_ROOT_SHA256 || '') || rootFingerprint(root) !== process.env.MONITOR_ROOT_SHA256) throw new Error('Independently pinned MONITOR_ROOT_SHA256 fingerprint is absent or changed.');
    if (!process.env.MONITOR_STATE_DIRECTORY || !path.isAbsolute(process.env.MONITOR_STATE_DIRECTORY)) throw new Error('MONITOR_STATE_DIRECTORY must be a private absolute directory outside the checkout.');
    const directory = process.env.MONITOR_STATE_DIRECTORY;
    const logFile = path.join(directory, 'samples.jsonl');
    if (command === 'soak') {
      let samples = [];
      try {
        const log = await fs.lstat(logFile);
        if (!log.isFile() || log.size > 16 * 1024 * 1024) throw new Error('Invalid or oversized observations file.');
        samples = (await fs.readFile(logFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const result = assessSoak(samples, { authority: monitorAuthority(root, baseUrl) });
      console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1;
    } else {
      if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw new Error('External monitoring must run without GitHub write/admin or signing credentials; unset GitHub tokens.');
      if (!process.env.MONITOR_WEBHOOK_URL || !process.env.MONITOR_HEARTBEAT_URL) throw new Error('Configure an external alert receiver and independently watched heartbeat endpoint before monitoring.');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const stateStat = await fs.lstat(directory);
      if (!stateStat.isDirectory() || (stateStat.mode & 0o077)) throw new Error('Monitor state directory must be private (0700), not a symlink/shared directory.');
      const candidateLockFile = path.join(directory, 'probe.lock');
      lock = await fs.open(candidateLockFile, 'wx', 0o600); lockFile = candidateLockFile;
      work = await fs.mkdtemp(path.join(os.tmpdir(), 'mmx-external-probe-'));
      const database = path.join(directory, 'history.git'), historyDirectory = path.join(work, 'history');
      const remote = 'https://github.com/' + REGISTRY_REPOSITORY + '.git';
      const git = args => execFileSync('git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000, maxBuffer: 5 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      const latest = () => {
        const value = git(['ls-remote', '--heads', remote, 'refs/heads/production-publication']).trim().split(/\s+/)[0];
        if (!/^[a-f0-9]{40}$/.test(value || '')) throw new Error('Production publication is absent.');
        return value;
      };
      let commit;
      try {
        commit = latest();
        if (!await fs.stat(database).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) git(['init', '--bare', database]);
        git(['--git-dir=' + database, 'fetch', '--no-tags', remote, 'refs/heads/production-publication:refs/heads/monitor-history']);
        if (git(['--git-dir=' + database, 'rev-parse', 'refs/heads/monitor-history']).trim() !== commit) throw new Error('History changed during fetch.');
        await exportHistory({ repositoryDirectory: database, commit, outputDirectory: historyDirectory });
      } catch { commit = undefined; } // probe records a failing observation, never a pending success.
      let previous;
      try { previous = JSON.parse(await fs.readFile(path.join(directory, 'last-notified.json'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const result = await probeRegistry({ root, baseUrl, historyDirectory: commit ? historyDirectory : path.join(work, 'missing'), directory, historyCommit: commit,
        beforeRecord: async sample => {
          if (sample.kind === 'healthy' && (!commit || latest() !== commit)) throw new Error('History changed during probe.');
          const payload = { service: 'macromaxx-registry', ...sample };
          if (sample.kind !== 'healthy' || (previous && previous.kind !== 'healthy')) await notify(payload);
          if (sample.kind === 'healthy') await deliverAlert({ url: process.env.MONITOR_HEARTBEAT_URL, token: process.env.MONITOR_HEARTBEAT_TOKEN, payload });
          const temp = path.join(directory, 'last-notified.json.tmp');
          await fs.writeFile(temp, JSON.stringify({ kind: sample.kind }), { mode: 0o600 }); await fs.rename(temp, path.join(directory, 'last-notified.json'));
        },
      });
      console.log(JSON.stringify(result)); if (result.kind !== 'healthy') process.exitCode = 1;
    }
  }
} catch (error) {
  // Never print external URL, arbitrary git stderr or nested fetch causes.
  const safe = error.code === 'EEXIST' ? 'A probe is running or a stale probe.lock exists; inspect the monitor before removing its lock.' : /^(Usage:|Independently pinned|MONITOR_STATE_DIRECTORY|Configure an external|External monitoring|Monitor state|Invalid pinned|External notification|Alert delivery)/.test(error.message) ? error.message : 'Monitoring failed. Inspect local state, history availability, root pin and receiver configuration; no trust state was reset.';
  console.error(safe); process.exitCode = 1;
} finally {
  if (work) await fs.rm(work, { recursive: true, force: true });
  if (lock) { await lock.close(); await fs.unlink(lockFile); }
}
