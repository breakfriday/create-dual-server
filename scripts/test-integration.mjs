import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'dual-server-integration-'));
function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} ${args.join(' ')} exited ${result.status}`);
}
function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (!cli || !/npm-cli\.js$/i.test(cli)) throw new Error('Run with npm run test:integration');
  run(process.execPath, [cli, ...args], cwd);
}

try {
  // Exercise the actual npm artifact: nested template package.json/.gitignore must survive packing.
  npm(['pack', '--pack-destination', temp], root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  const archive = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  npm(['install', '--prefix', consumer, '--no-audit', '--no-fund', join(temp, archive)], temp);
  const app = join(temp, '中文 example server');
  const cli = join(consumer, 'node_modules', pkg.name, 'bin/create-dual-server.mjs');
  run(process.execPath, [cli, app, '--name', 'integration-server'], temp);
  npm(['install', '--no-audit', '--no-fund'], app);
  npm(['run', 'check'], app);
  npm(['test'], app);
  npm(['run', 'test:production'], app);
  if (process.platform === 'win32' && process.env.WINSW_EXE) {
    npm(['run', 'build:winserver'], app);
  } else if (process.platform !== 'win32') {
    const rejected = spawnSync(process.execPath, ['scripts/build-winserver.cjs'], { cwd: app, encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /requires Windows x64/);
  }
  npm(['ci', '--omit=dev', '--no-audit', '--no-fund'], app);
  run(process.execPath, ['scripts/smoke-production.cjs', '--http'], app);
  console.log('Packed CLI → generated app → production-only dependencies → SQLite/HTTP: passed.');
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
