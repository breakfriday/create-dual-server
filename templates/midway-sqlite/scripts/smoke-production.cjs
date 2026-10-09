const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');

async function checkHttp(appDir, temp) {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close(error => (error ? reject(error) : resolve()))
  );
  const child = spawn(process.execPath, [join(appDir, 'bootstrap.js')], {
    // Deliberately start outside appDir to verify bootstrap and data path handling.
    cwd: temp,
    env: { ...process.env, SERVER_HTTP_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError;
  child.on('error', error => {
    spawnError = error;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      output = (output + chunk.toString()).slice(-12000);
    });
  }
  const exited = new Promise(resolve => child.once('close', resolve));
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) break;
      let response;
      try {
        response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        await delay(200);
        continue;
      }
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'ok' });
      const endpoint = `http://127.0.0.1:${port}/api/notes`;
      const request = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(3000) });
      const invalid = await request(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: ' ' }),
      });
      assert.equal(invalid.status, 400);
      const created = await request(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'http-probe' }),
      });
      assert.equal(created.status, 201);
      assert.equal((await created.json()).content, 'http-probe');
      const list = await request(endpoint);
      assert.equal(list.status, 200);
      const notes = await list.json();
      assert.ok(notes.some(note => note.content === 'deployment-probe'));
      assert.ok(notes.some(note => note.content === 'http-probe'));
      console.log(
        'Production HTTP smoke check passed: bootstrap from another working directory.'
      );
      return;
    }
    throw new Error(`Production server did not become ready.\n${output}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    } else {
      await exited;
    }
  }
}

async function main() {
  const appDir = resolve(
    process.argv.slice(2).find(arg => !arg.startsWith('--')) ||
      join(__dirname, '..')
  );
  const appRequire = createRequire(join(appDir, 'package.json'));
  const temp = mkdtempSync(join(tmpdir(), 'dual-server-production-'));
  let source;
  try {
    // Keep the probe isolated even if the build shell has production overrides.
    for (const key of [
      'SERVER_DATA_DIR',
      'SERVER_LOG_DIR',
      'SERVER_HTTP_PORT',
      'COOKIE_KEYS',
    ])
      delete process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.SERVER_CONFIG_FILE = join(temp, 'server.json');
    writeFileSync(
      process.env.SERVER_CONFIG_FILE,
      JSON.stringify({
        dataDir: './data',
        cookieKeys: 'isolated-production-smoke-key',
        logDir: './logs',
      })
    );
    appRequire('./deployment.cjs').configureProduction(appDir);
    const options = appRequire('./dist/config/config.default.js').default
      .typeorm.dataSource.default;
    assert.equal(options.synchronize, false);
    assert.equal(options.migrationsRun, true);
    assert.equal(options.database, join(temp, 'data', 'server.sqlite'));
    const { DataSource } = appRequire('typeorm');
    source = new DataSource(options);
    await source.initialize();
    for (const entity of options.entities) {
      await source.getRepository(entity).find({ take: 1 });
    }
    assert.equal(await source.showMigrations(), false);
    const note = options.entities.find(entity => entity.name === 'Note');
    await source
      .getRepository(note)
      .save({ content: 'deployment-probe' });
    await source.destroy();
    source = new DataSource(options);
    await source.initialize();
    assert.equal(await source.getRepository(note).count(), 1);
    assert.equal(await source.showMigrations(), false);
    assert.deepEqual(await source.query('PRAGMA foreign_key_check'), []);
    console.log(
      'Production SQLite smoke check passed: fresh schema, all entities, restart persistence, foreign key integrity.'
    );
    if (process.argv.includes('--http')) {
      await source.destroy();
      await checkHttp(appDir, temp);
      source = new DataSource(options);
      await source.initialize();
      assert.equal(await source.getRepository(note).count(), 2);
      assert.equal(await source.showMigrations(), false);
    }
  } finally {
    if (source?.isInitialized) await source.destroy();
    rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
