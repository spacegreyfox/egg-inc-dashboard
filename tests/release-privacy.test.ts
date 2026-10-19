import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectReleaseFile } from '../scripts/check-release.mjs';

test('release guard rejects runtime databases, exports, local paths, game IDs and credentials', () => {
  for (const path of ['data/farm.sqlite', 'data/farm.sqlite-wal', 'exports/history.csv', '.env.local', 'dist/index.html', 'node_modules/dependency/index.js']) assert.ok(inspectReleaseFile(path, Buffer.from('')).length, path);
  const privateId = 'EI' + '9876543210123456';
  const userPath = ['', 'Users', 'example-user', 'project'].join('/');
  const fakeToken = 'gh' + 'p_' + 'x'.repeat(40);
  assert.ok(inspectReleaseFile('fixture.json', Buffer.from(privateId)).includes('non-synthetic game ID'));
  assert.ok(inspectReleaseFile('README.md', Buffer.from(userPath)).includes('local user path'));
  assert.ok(inspectReleaseFile('fixture.json', Buffer.from(fakeToken)).includes('likely credential'));
  assert.deepEqual(inspectReleaseFile('server/demo.ts', Buffer.from('EI' + '0'.repeat(16))), []);
});
