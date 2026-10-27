const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { configureProduction } = require('../../deployment.cjs');

test('PostgreSQL deployment creates uploads/logs and requires credentials', t => {
  const root = mkdtempSync(join(tmpdir(), 'dual-postgres-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { NODE_ENV: 'production', COOKIE_KEYS: 'test-key' };
  assert.throws(() => configureProduction(root, env), /PGPASSWORD/);
  assert.equal(existsSync(join(root, 'data')), false);
  env.PGPASSWORD = 'test-password';
  configureProduction(root, env);
  assert.equal(env.SERVER_UPLOAD_DIR, join(root, 'data/uploads'));
  assert.equal(env.SERVER_LOG_DIR, join(root, 'data/logs'));
  assert.ok(existsSync(env.SERVER_UPLOAD_DIR));
  assert.equal(existsSync(join(root, 'data/server.sqlite')), false);
  assert.throws(() => configureProduction(root, { ...env, SERVER_UPLOAD_DIR: './relative' }), /absolute path/);
});
