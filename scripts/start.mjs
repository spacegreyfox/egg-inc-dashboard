import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Farm Observatory\n\nUse Node.js 24, then run npm start.\nUse npm run demo for synthetic sample data.\nOpen http://localhost:8890 and enter your own EID locally.\nPress Control-C to stop.');
  process.exit(0);
}
if (args.some(arg => arg !== '--demo')) {
  console.error('Unknown option. Use --help or --demo.'); process.exit(1);
}
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Node.js 24 is required. Install it from https://nodejs.org/ and try again.'); process.exit(1);
}
process.chdir(root);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(args) {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    console.error('Setup failed. Check the output above, then retry.'); process.exit(result.status || 1);
  }
}
if (!existsSync(resolve(root, 'node_modules/tsx/package.json'))) run(['ci', '--no-audit', '--no-fund']);
run(['run', 'build']);
const env = { ...process.env };
if (args.includes('--demo')) {
  env.DASHBOARD_DEMO = '1';
  env.DASHBOARD_DATA = resolve(root, 'data/demo.sqlite');
} else {
  delete env.DASHBOARD_DEMO;
}
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', () => { console.error('The local server could not start.'); process.exit(1); });
child.once('exit', code => process.exit(code ?? 0));
