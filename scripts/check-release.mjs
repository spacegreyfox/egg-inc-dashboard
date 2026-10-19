import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const synthetic = new Set(['0', '1', '2'].map(digit => 'EI' + digit.repeat(16)));
const excluded = new Set(['.git', 'node_modules', 'dist', 'data', 'releases', 'coverage']);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name) || entry.name === '.DS_Store') return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path).split(sep).join('/')];
  });
}
export function releaseFiles() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (top.status === 0 && resolve(top.stdout.trim()) === resolve(root)) {
    const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
    const files = tracked.stdout?.split('\0').filter(Boolean) ?? [];
    if (tracked.status === 0 && files.length) return files;
  }
  return walk(root);
}
export function inspectReleaseFile(path, content) {
  const issues = [];
  if (/(^|\/)(data|node_modules|dist|releases|coverage|\.git|\.netlify)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:sqlite(?:-wal|-shm)?|db|log|csv|zip|pem|key)$|\.DS_Store$/i.test(path)) issues.push('private/runtime file');
  const text = content.toString('utf8');
  if (/\/(?:Users|home)\/[\w.-]+\//.test(text) || /[A-Za-z]:\\Users\\[^\\]+\\/.test(text)) issues.push('local user path');
  for (const match of text.matchAll(/\bEI\d{16}\b/gi)) if (!synthetic.has(match[0])) issues.push('non-synthetic game ID');
  if (/\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(text) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push('likely credential');
  return [...new Set(issues)];
}
export function checkRelease() {
  const files = releaseFiles(), failures = [];
  for (const path of files) {
    const absolute = resolve(root, path);
    if (lstatSync(absolute).isSymbolicLink()) { failures.push(`${path}: symbolic links cannot be packaged`); continue; }
    for (const issue of inspectReleaseFile(path, readFileSync(absolute))) failures.push(`${path}: ${issue}`);
  }
  if (failures.length) throw new Error('Release privacy check failed:\n' + failures.join('\n'));
  return files.length;
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try { console.log(`Release privacy check passed: ${checkRelease()} files; no runtime data, local user paths, non-synthetic EIDs, or likely credentials.`); }
  catch (error) { console.error(error.message); process.exit(1); }
}
