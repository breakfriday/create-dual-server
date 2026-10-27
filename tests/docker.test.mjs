import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function fixture(t, database = 'better-sqlite3') {
  const root = mkdtempSync(join(tmpdir(), 'dual-docker-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, '中文 app');
  const result = spawnSync(process.execPath, [resolve('bin/create-dual-server.mjs'), app, '--name', 'docker-example', '--port', '8123', '--database', database]);
  assert.equal(result.status, 0, result.stderr?.toString());
  const calls = [];
  const env = {};
  const argv = ['node', 'build-docker.cjs'];
  let failure;
  const sandbox = {
    require: name => name === 'node:child_process' ? {
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === failure) return { status: 1 };
        if (args[0] === 'save') writeFileSync(args[2], 'fake image archive');
        return { status: 0 };
      },
    } : require(name),
    __dirname: join(app, 'scripts'), module: { exports: {} },
    process: { argv, env, getuid: () => 1234, getgid: () => 2345 },
    console: { log() {} },
  };
  runInNewContext(readFileSync(join(app, 'scripts/build-docker.cjs'), 'utf8'), sandbox);
  return { app, calls, env, argv, main: sandbox.module.exports.main, fail: value => { failure = value; } };
}

test('Docker packaging exports a unique offline bundle with customized config and fresh secrets', t => {
  const f = fixture(t);
  writeFileSync(join(f.app, 'package-lock.json'), '{}');
  f.main();
  f.main();
  const outputs = readdirSync(join(f.app, 'release/docker')).map(name => join(f.app, 'release/docker', name));
  assert.equal(outputs.length, 2);
  const configs = outputs.map(path => readFileSync(join(path, '.env'), 'utf8'));
  for (const [index, path] of outputs.entries()) {
    assert.match(configs[index], /SERVER_IMAGE=docker-example:0.1.0\n/);
    assert.match(configs[index], /SERVER_HTTP_PORT=8123\n/);
    assert.match(configs[index], /SERVER_UID=1234\nSERVER_GID=2345/);
    assert.match(configs[index], /COOKIE_KEYS=[a-f0-9]{64}\n/);
    assert.ok(readdirSync(path).includes('docker-example_0.1.0.tar'));
    assert.match(readFileSync(join(path, 'compose.yaml'), 'utf8'), /:8123"/);
  }
  assert.notEqual(configs[0], configs[1]);
  assert.equal(f.calls[0].options.cwd, f.app);
  assert.equal(JSON.stringify(f.calls[0].args), JSON.stringify(['build', '-f', 'deploy/docker/Dockerfile', '-t', 'docker-example:0.1.0', '.']));
});

test('no-export supports a registry tag and never invokes docker save', t => {
  const f = fixture(t);
  writeFileSync(join(f.app, 'package-lock.json'), '{}');
  f.argv.push('--no-export');
  f.env.SERVER_IMAGE = 'registry.example:5000/team/server:1.2.3';
  f.main();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].args[4], f.env.SERVER_IMAGE);
});

test('invalid input and build failure do not produce a deployment bundle', t => {
  const f = fixture(t);
  assert.throws(f.main, /Missing package-lock/);
  writeFileSync(join(f.app, 'package-lock.json'), '{}');
  f.argv.push('--export', '--no-export');
  assert.throws(f.main, /不能同时/);
  f.argv.splice(2);
  f.env.SERVER_IMAGE = 'bad\nCOOKIE_KEYS=injected';
  assert.throws(f.main, /镜像名称/);
  assert.equal(f.calls.length, 0);
  delete f.env.SERVER_IMAGE;
  f.fail('build');
  assert.throws(f.main, /build failed/);
  assert.ok(!readdirSync(f.app).includes('release'));
});

test('PostgreSQL bundle exports both images and the three data directories', t => {
  const f = fixture(t, 'postgres');
  writeFileSync(join(f.app, 'package-lock.json'), '{}');
  f.main();
  const output = join(f.app, 'release/docker', readdirSync(join(f.app, 'release/docker'))[0]);
  assert.deepEqual(readdirSync(join(output, 'data')).sort(), ['logs', 'postgres', 'uploads']);
  const env = readFileSync(join(output, '.env'), 'utf8');
  assert.match(env, /POSTGRES_CONTAINER_NAME=docker-example-PostgreSQL/);
  assert.match(env, /POSTGRES_PASSWORD=[a-f0-9]{64}/);
  assert.match(env, /SERVER_UPLOAD_PATH=.\/data\/uploads/);
  const save = f.calls.find(call => call.args[0] === 'save');
  assert.equal(save.args[3], 'docker-example:0.1.0');
  assert.equal(save.args[4], 'postgres:17-bookworm');
  const pkg = JSON.parse(readFileSync(join(f.app, 'package.json')));
  assert.ok(pkg.dependencies.pg);
  assert.equal(pkg.dependencies['better-sqlite3'], undefined);
});

test('PostgreSQL smoke failure cleans temporary containers and prevents delivery', t => {
  const f = fixture(t, 'postgres');
  writeFileSync(join(f.app, 'package-lock.json'), '{}');
  f.fail('exec');
  assert.throws(f.main, /exec failed/);
  assert.ok(f.calls.some(call => call.args[0] === 'rm'));
  assert.ok(f.calls.some(call => call.args[0] === 'network' && call.args[1] === 'rm'));
  assert.ok(!readdirSync(f.app).includes('release'));
});
