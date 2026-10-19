import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease } from './check-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Git could not create the release. Commit the clean source first.');
  return result.stdout;
}
try {
  const top = git(['rev-parse', '--show-toplevel']).trim();
  if (resolve(top) !== resolve(root)) throw new Error('Create a dedicated Git repository for this app before packaging.');
  if (git(['status', '--porcelain', '--untracked-files=no']).trim()) throw new Error('Commit reviewed source changes before creating a release.');
  const count = checkRelease();
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric semantic version.');
  mkdirSync(resolve(root, 'releases'), { recursive: true });
  const path = resolve(root, 'releases', `egg-inc-dashboard-v${version}.zip`);
  git(['archive', '--format=zip', '--prefix=egg-inc-dashboard/', '--output=' + path, 'HEAD']);
  console.log(`Created releases/egg-inc-dashboard-v${version}.zip from ${count} checked source files. Runtime data and Git history are excluded.`);
} catch (error) { console.error(error.message); process.exit(1); }
