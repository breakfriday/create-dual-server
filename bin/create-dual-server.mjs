#!/usr/bin/env node
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { promptOptions } from './prompt-options.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(root, 'templates', 'midway-sqlite');

function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--help', '-h'].includes(arg)) return { help: true };
    if (['--version', '-v'].includes(arg)) return { version: true };
    if (['--yes', '-y'].includes(arg)) { options.yes = true; continue; }
    if (arg === '--interactive') { options.interactive = true; continue; }
    if (arg === '--install') { options.install = true; continue; }
    if (['--name', '--port', '--database'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (options.directory !== undefined) throw new Error('Only one project directory is allowed');
      options.directory = arg;
    }
  }
  return options;
}

async function generate(source, target, values, overwrite = false) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const dest = join(target, entry.name === '_gitignore' ? '.gitignore' : entry.name);
    const src = join(source, entry.name);
    if (entry.isDirectory()) await generate(src, dest, values, overwrite);
    else {
      // Exclusive creation also guards against a file appearing after the empty-directory check.
      await copyFile(src, dest, overwrite ? 0 : constants.COPYFILE_EXCL);
      let text = await readFile(dest, 'utf8');
      for (const [token, value] of Object.entries(values)) text = text.replaceAll(token, value);
      await writeFile(dest, text);
    }
  }
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: create-dual-server [directory] [options]

Creates a Midway 4 + TypeORM application with SQLite or PostgreSQL.
In a terminal, prompts for missing directory, application name and database.
Default directory: dual-server-app. Existing directories must be empty.

  --name <name>   Package / Docker image / Windows service name (lowercase letters, digits, hyphens)
  --port <port>   Default HTTP port (7001)
  --database <db> better-sqlite3 (default) or postgres
  --install       Run npm install after generation
  --yes, -y       Skip prompts and use defaults for unspecified options
  --interactive   Show prompts even when stdin is not a terminal
  --version, -v   Print version
  --help, -h      Print help

Docker bundles require Docker with Linux containers.
Windows bundles must be built on Windows x64 using Node 22 or 24.
Dependencies are not installed unless --install is supplied.`);
    return;
  }
  if (options.version) {
    console.log(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version);
    return;
  }
  if (!options.yes && (options.interactive || process.stdin.isTTY)) {
    await promptOptions(options);
  }
  const database = options.database ?? 'better-sqlite3';
  if (!['better-sqlite3', 'postgres'].includes(database)) throw new Error('--database must be better-sqlite3 or postgres');
  const target = resolve(options.directory || 'dual-server-app');
  const inferred = basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = options.name ?? (inferred || 'dual-server-app');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) {
    throw new Error('Use --name with 1–64 lowercase letters, digits or hyphens, starting with a letter');
  }
  const port = options.port ?? '7001';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('--port must be an integer from 1 to 65535');
  }
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(target)).length) {
      throw new Error(`Target must be an empty directory, not a symlink: ${target}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await generate(template, target, { '__APP_NAME__': name, '__HTTP_PORT__': String(Number(port)) });
  if (database === 'postgres') {
    await generate(join(root, 'templates', 'midway-postgres'), target, { '__APP_NAME__': name, '__HTTP_PORT__': String(Number(port)) }, true);
  }
  const packagePath = join(target, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  pkg.dualServer = { database };
  if (database === 'postgres') {
    delete pkg.dependencies['better-sqlite3'];
    pkg.dependencies.pg = '^8.13.1';
    pkg.description = 'MidwayJS server with PostgreSQL and Docker deployment';
    pkg.engines.node = '>=22.9.0 <23 || 24.x';
    Object.assign(pkg.scripts, {
      "predev": "node scripts/init-dev-env.cjs",
      "dev": "cross-env NODE_ENV=local node --env-file-if-exists=dev.env scripts/dev.cjs --watch --run @midwayjs/mock/app.js",
      "predev:db": "node scripts/init-dev-env.cjs",
      "dev:db": "docker compose --project-directory . --env-file dev.env -f deploy/docker/compose.dev.yaml up -d --wait --wait-timeout 90 postgres",
      "dev:db:stop": "docker compose --project-directory . --env-file dev.env -f deploy/docker/compose.dev.yaml stop postgres",
      "dev:db:logs": "docker compose --project-directory . --env-file dev.env -f deploy/docker/compose.dev.yaml logs --tail 100 -f postgres",
      "dev:db:status": "docker compose --project-directory . --env-file dev.env -f deploy/docker/compose.dev.yaml ps -a"
});
  }
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Created ${name} (${database}) in ${target}`);
  if (options.install) {
    const npmCli = process.env.npm_execpath;
    // npm.cmd requires cmd.exe on Windows; no user text is interpolated into its command.
    const result = npmCli && /npm-cli\.js$/i.test(npmCli)
      ? spawnSync(process.execPath, [npmCli, 'install'], { cwd: target, stdio: 'inherit' })
      : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
          cwd: target, stdio: 'inherit', shell: process.platform === 'win32',
        });
    if (result.error || result.status !== 0) {
      throw new Error(`Project was created, but npm install failed. Retry inside ${target}. ${result.error?.message || ''}`);
    }
  }
  console.log(`\nNext steps:\n  cd "${target}"\n${options.install ? '' : '  npm install\n'}${database === 'postgres' ? '  npm run dev:db\n  # Edit dev.env to change local database credentials and ports\n' : ''}  npm run dev\n\nOptional packaging commands (not executed):\n  Windows x64: prepare scripts/WinSW-x64.exe, then npm run build:winserver\n  Docker: npm run build:docker`);
}

main().catch(error => { console.error(`create-dual-server: ${error.message}`); process.exitCode = 1; });
