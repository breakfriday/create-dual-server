const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { configureProduction } = require('../../deployment.cjs');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dual-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, '中文 deployment', 'config');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'server.json');
  writeFileSync(file, '\uFEFF' + JSON.stringify({ dataDir: '../data', logDir: '../logs', httpPort: 7101, cookieKeys: 'test-key' }));
  return { root, dir, file, env: { NODE_ENV: 'production', SERVER_CONFIG_FILE: file } };
}

test('development ignores production config', t => {
  const { root } = fixture(t);
  const env = { NODE_ENV: 'local', SERVER_CONFIG_FILE: 'missing' };
  configureProduction(root, env);
  assert.equal(env.SERVER_DATA_DIR, undefined);
});

test('JSON paths resolve relative to config, with BOM and Unicode path support', t => {
  const { root, dir, env } = fixture(t);
  configureProduction(join(root, 'unrelated'), env);
  assert.equal(env.SERVER_DATA_DIR, join(dir, '..', 'data'));
  assert.equal(env.SERVER_LOG_DIR, join(dir, '..', 'logs'));
  assert.equal(env.SERVER_HTTP_PORT, '7101');
  assert.equal(env.COOKIE_KEYS, 'test-key');
  assert.ok(existsSync(env.SERVER_DATA_DIR));
});

test('environment wins; repeated startup preserves existing database', t => {
  const { root, env } = fixture(t);
  env.SERVER_DATA_DIR = join(root, 'existing');
  env.SERVER_HTTP_PORT = '7201';
  env.COOKIE_KEYS = 'external-key';
  mkdirSync(env.SERVER_DATA_DIR);
  const database = join(env.SERVER_DATA_DIR, 'server.sqlite');
  writeFileSync(database, 'customer database');
  configureProduction(root, env);
  configureProduction(root, env);
  assert.equal(readFileSync(database, 'utf8'), 'customer database');
  assert.equal(env.SERVER_HTTP_PORT, '7201');
  assert.equal(env.COOKIE_KEYS, 'external-key');
});

test('invalid config fails before side effects', t => {
  const { root, dir, file, env } = fixture(t);
  for (const invalid of ['null', '[]', '{bad', '{"dataDir":true}', ...[true, 0, 65536, 1.5, '', '1e3', ' '].map(httpPort => JSON.stringify({ dataDir: '../data', httpPort, cookieKeys: 'key' })), '{"dataDir":"../data"}']) {
    writeFileSync(file, invalid);
    const copy = { ...env };
    assert.throws(() => configureProduction(root, copy));
    assert.deepEqual(copy, env);
    assert.equal(existsSync(join(dir, '..', 'data')), false);
  }
});

test('production refuses missing data directory and relative environment paths', t => {
  const { root, env } = fixture(t);
  assert.throws(() => configureProduction(root, { NODE_ENV: 'production' }), /requires SERVER_DATA_DIR/);
  assert.throws(() => configureProduction(root, { ...env, SERVER_DATA_DIR: './data' }), /absolute path/);
  assert.throws(() => configureProduction(root, { ...env, SERVER_CONFIG_FILE: './server.json' }), /absolute path/);
});
