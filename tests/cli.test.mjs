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
  for (const args of [['--database', 'mysql'], ['--unknown'], ['one', 'two'], ['--port'], ['--port', '70000'], ['--port', '1e3'], ['--name', 'bad&name'], ['--name', '../bad'], ['--name', '123'], ['--name', 'a'.repeat(65)]]) {
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

test('postgres selection generates PostgreSQL migration and deployment configuration', t => {
  const cwd = fixture(t);
  assert.equal(run(cwd, 'pg-app', '--database', 'postgres').status, 0);
  const app = join(cwd, 'pg-app');
  const tests = spawnSync(process.execPath, ['--test', 'scripts/test/deployment.test.cjs'], { cwd: app, encoding: 'utf8' });
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);
  assert.match(readFileSync(join(app, 'src/migration/1786320000000-CreateNotes.ts'), 'utf8'), /SERIAL PRIMARY KEY/);
  assert.match(readFileSync(join(app, 'deploy/docker/compose.yaml'), 'utf8'), /pg-app-PostgreSQL/);
});

const interactive = (cwd, input, ...args) => spawnSync(process.execPath,
  [cli, ...args, '--interactive'], { cwd, input, encoding: 'utf8', timeout: 10000 });

test('interactive creation asks for name and database, retries invalid answers', t => {
  const cwd = fixture(t);
  const result = interactive(cwd, 'Bad Name\nchosen-server\n3\n2\n', 'chosen-folder');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /应用名称/);
  assert.match(result.stdout, /数据库方案/);
  const pkg = JSON.parse(readFileSync(join(cwd, 'chosen-folder/package.json')));
  assert.equal(pkg.name, 'chosen-server');
  assert.equal(pkg.dualServer.database, 'postgres');
  assert.ok(pkg.dependencies.pg);
  assert.ok(!readdirSync(join(cwd, 'chosen-folder')).includes('node_modules'));
  assert.ok(!readdirSync(join(cwd, 'chosen-folder')).includes('dist'));
});

test('interactive defaults include directory; explicit options and yes skip prompts', t => {
  const cwd = fixture(t);
  const defaults = interactive(cwd, '\n\n\n');
  assert.equal(defaults.status, 0, defaults.stdout + defaults.stderr);
  const pkg = JSON.parse(readFileSync(join(cwd, 'dual-server-app/package.json')));
  assert.equal(pkg.name, 'dual-server-app');
  assert.equal(pkg.dualServer.database, 'better-sqlite3');
  const explicit = interactive(cwd, '', 'explicit', '--name', 'explicit', '--database', 'postgres');
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.doesNotMatch(explicit.stdout, /应用名称|数据库方案/);
  const yes = interactive(cwd, '', 'defaults', '--yes');
  assert.equal(yes.status, 0, yes.stderr);
  assert.doesNotMatch(yes.stdout, /应用名称|数据库方案/);
});

test('EOF in the wizard cancels before creating a project', t => {
  const cwd = fixture(t);
  const result = interactive(cwd, 'chosen-name\n', 'cancelled');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cancelled/);
  assert.deepEqual(readdirSync(cwd), []);
});

test('PostgreSQL dev config initializes once and native env loading honors overrides', t => {
  const cwd = fixture(t);
  assert.equal(run(cwd, 'local-pg', '--database', 'postgres', '--port', '8125').status, 0);
  const app = join(cwd, 'local-pg');
  const init = () => spawnSync(process.execPath, ['scripts/init-dev-env.cjs'], { cwd: app, encoding: 'utf8' });
  assert.equal(init().status, 0);
  const original = readFileSync(join(app, 'dev.env'), 'utf8');
  assert.match(original, /PGUSER=local-pg/);
  assert.match(original, /SERVER_HTTP_PORT=8125/);
  const customized = original.replace('PGPORT=5432', 'PGPORT=15432').replace('local-pg-dev-password', 'custom-development-password');
  writeFileSync(join(app, 'dev.env'), customized);
  assert.equal(init().status, 0);
  assert.equal(readFileSync(join(app, 'dev.env'), 'utf8'), customized);
  const env = { ...process.env };
  delete env.PGPORT;
  delete env.PGPASSWORD;
  const probe = extra => spawnSync(process.execPath, ['--env-file-if-exists=dev.env', '-e',
    'console.log(JSON.stringify([process.env.PGPORT, process.env.PGPASSWORD]))'], { cwd: app, env: { ...env, ...extra }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(probe({}).stdout), ['15432', 'custom-development-password']);
  assert.deepEqual(JSON.parse(probe({ PGPORT: '25432' }).stdout), ['25432', 'custom-development-password']);
  // Simulate mwtsc's worker changing cwd and reusing the parent's Node flags.
  mkdirSync(join(app, 'node_modules/mwtsc/bin'), { recursive: true });
  writeFileSync(join(app, 'node_modules/mwtsc/bin/mwtsc.js'), `
    const { spawnSync } = require('node:child_process');
    const env = { ...process.env };
    delete env.PGPORT;
    delete env.PGPASSWORD;
    const result = spawnSync(process.execPath, [...process.execArgv, '-e',
      'console.log(JSON.stringify([process.env.PGPORT, process.env.PGPASSWORD]))'],
      { cwd: require('node:os').tmpdir(), env, encoding: 'utf8' });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.status;
  `);
  const worker = spawnSync(process.execPath, ['--env-file-if-exists=dev.env', 'scripts/dev.cjs'],
    { cwd: app, env, encoding: 'utf8' });
  assert.equal(worker.status, 0, worker.stderr);
  assert.doesNotMatch(worker.stderr, /not found/);
  assert.deepEqual(JSON.parse(worker.stdout), ['15432', 'custom-development-password']);
  const pkg = JSON.parse(readFileSync(join(app, 'package.json')));
  assert.match(pkg.scripts.dev, /--env-file-if-exists=dev.env/);
  assert.match(pkg.scripts['dev:db'], /--project-directory \. --env-file dev.env/);
  assert.match(readFileSync(join(app, '.gitignore'), 'utf8'), /dev\.env/);
});
