import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'bin/create-dual-server.mjs');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dual-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

test('CLI generates a customized standalone app in a path containing spaces and Unicode', t => {
  const cwd = fixture(t);
  const result = run(cwd, '中文 project', '--name', 'example-server', '--port', '8123', '-y');
  assert.equal(result.status, 0, result.stderr);
  const target = join(cwd, '中文 project');
  assert.equal(JSON.parse(readFileSync(join(target, 'package.json'))).name, 'example-server');
  assert.equal(JSON.parse(readFileSync(join(target, 'deploy/windows/server.json'))).httpPort, 8123);
  assert.match(readFileSync(join(target, 'deploy/windows/service.xml'), 'utf8'), /<id>example-server<\/id>/);
  assert.ok(readdirSync(target).includes('.gitignore'));
  function inspect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) inspect(path);
      else assert.doesNotMatch(readFileSync(path, 'utf8'), /__(APP_NAME|HTTP_PORT)__/, path);
    }
  }
  inspect(target);
  const tests = spawnSync(process.execPath, ['--test', 'scripts/test/deployment.test.cjs'], { cwd: target, encoding: 'utf8' });
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);
});

test('existing files, hidden files and symlink destinations are protected', t => {
  const cwd = fixture(t);
  mkdirSync(join(cwd, 'existing'));
  writeFileSync(join(cwd, 'existing/.keep'), 'keep me');
  assert.equal(run(cwd, 'existing').status, 1);
  assert.equal(readFileSync(join(cwd, 'existing/.keep'), 'utf8'), 'keep me');
  assert.equal(run(cwd, 'existing/.keep').status, 1);
  mkdirSync(join(cwd, 'empty'));
  symlinkSync(join(cwd, 'empty'), join(cwd, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(run(cwd, 'linked').status, 1);
  assert.deepEqual(readdirSync(join(cwd, 'empty')), []);
});

test('invalid flags and injection-like names fail without writing files', t => {
  const cwd = fixture(t);
  for (const args of [['--unknown'], ['one', 'two'], ['--port'], ['--port', '70000'], ['--port', '1e3'], ['--name', 'bad&name'], ['--name', '../bad'], ['--name', '123'], ['--name', 'a'.repeat(65)]]) {
    assert.equal(run(cwd, ...args).status, 1, args.join(' '));
  }
  assert.deepEqual(readdirSync(cwd), []);
});

test('help/version do not write; current empty directory is supported', t => {
  const cwd = fixture(t);
  assert.equal(run(cwd, '--help').status, 0);
  assert.equal(run(cwd, '--version').stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'))).version);
  assert.deepEqual(readdirSync(cwd), []);
  assert.equal(run(cwd, '.', '--name', 'current-app').status, 0);
});
