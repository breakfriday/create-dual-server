const {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { randomBytes } = require('node:crypto');
const { dirname, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const serverDir = resolve(__dirname, '..');
const defaultWinswPath = join(__dirname, 'WinSW-x64.exe');

function run(executable, args, cwd, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${executable} failed (exit ${result.status}, signal ${result.signal})`
    );
  }
}

function resolveWinSW() {
  const file = process.env.WINSW_EXE
    ? resolve(process.env.WINSW_EXE)
    : defaultWinswPath;
  const instructions =
    '请事先手动下载 WinSW-x64.exe，\n' +
    `放到：${file}\n` +
    '也可以通过 WINSW_EXE 环境变量指定该文件的本地路径。';
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(
      `未找到 WinSW 文件，构建脚本不会自动下载。\n${instructions}`
    );
  }
  return file;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Build on Windows x64 with Node.js 22 or 24 LTS: npm run build:winserver\n' +
        'Uses the current node.exe and npm lockfile; installs production dependencies. Output: release/winserver/<build>/__APP_NAME__.zip\n' +
        '请事先手动准备 WinSW-x64.exe。\n' +
        `WinSW 默认放置位置：${defaultWinswPath}\n` +
        'Optional WINSW_EXE: path to a local WinSW executable.'
    );
    return;
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      'build:winserver requires Windows x64 (or a Windows CI runner). ' +
        'Build the Windows bundle on Windows.'
    );
  }
  if (![22, 24].includes(Number(process.versions.node.split('.')[0]))) {
    throw new Error(
      'Build with Node.js 22 or 24 LTS; that exact runtime will be bundled.'
    );
  }
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !/npm-cli\.js$/i.test(npmCli)) {
    throw new Error(
      'Invoke with npm run build:winserver so the matching npm CLI is available.'
    );
  }
  // Check local prerequisites before compiling.
  const winsw = resolveWinSW();
  if (!existsSync(join(serverDir, 'package-lock.json'))) {
    throw new Error('Missing package-lock.json. Run npm install and commit the lockfile before building.');
  }
  run(process.execPath, [npmCli, 'run', 'build'], serverDir);

  const pkg = JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8'));
  const buildId =
    `${pkg.version}-node${process.versions.node}-win-x64-` +
    new Date().toISOString().replace(/[:.]/g, '-') +
    '-' +
    randomBytes(3).toString('hex');
  // Always stage into a new directory. Never clean an earlier deployment or its data.
  const buildDir = join(serverDir, 'release', 'winserver', buildId);
  const bundleDir = join(buildDir, '__APP_NAME__');
  const appDir = join(bundleDir, 'app');
  for (const dir of ['app', 'runtime', 'config', 'data', 'logs']) {
    mkdirSync(join(bundleDir, dir), { recursive: true });
  }
  cpSync(join(serverDir, 'dist'), join(appDir, 'dist'), {
    recursive: true,
    filter: source => !source.endsWith('.d.ts'),
  });
  for (const file of ['bootstrap.js', 'deployment.cjs', 'package-lock.json']) {
    copyFileSync(join(serverDir, file), join(appDir, file));
  }
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      {
        ...pkg,
        scripts: { start: 'node bootstrap.js' },
      },
      null,
      2
    ) + '\n'
  );
  copyFileSync(process.execPath, join(bundleDir, 'runtime', 'node.exe'));

  // Install only production dependencies in the bundle; no separate prune is needed.
  run(
    process.execPath,
    [
      npmCli,
      'ci',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--workspaces=false',
      '--ignore-scripts=false',
    ],
    appDir,
    {
      ...process.env,
      NODE_ENV: 'production',
      PATH: `${dirname(process.execPath)};${process.env.PATH || ''}`,
    }
  );

  // Exercise the shipped native module, every entity and the production migration chain.
  // The probe uses a temporary database; no development or customer data is packaged.
  run(
    join(bundleDir, 'runtime', 'node.exe'),
    [join(__dirname, 'smoke-production.cjs'), appDir, '--check-only'],
    appDir
  );

  copyFileSync(winsw, join(bundleDir, 'service.exe'));

  const templates = join(serverDir, 'deploy', 'windows');
  for (const file of [
    'service.xml',
    'start.cmd',
    'install-service.cmd',
    'uninstall-service.cmd',
  ]) {
    const content = readFileSync(join(templates, file), 'utf8').replace(
      /\r?\n/g,
      '\r\n'
    );
    writeFileSync(join(bundleDir, file), content);
  }
  const config = JSON.parse(
    readFileSync(join(templates, 'server.json'), 'utf8')
  );
  config.cookieKeys = randomBytes(32).toString('hex');
  writeFileSync(
    join(bundleDir, 'config', 'server.json'),
    JSON.stringify(config, null, 2) + '\n'
  );
  copyFileSync(join(templates, 'README.md'), join(bundleDir, 'README.md'));
  const zipPath = join(buildDir, '__APP_NAME__.zip');
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$ErrorActionPreference = "Stop"; ' +
        'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
        '[System.IO.Compression.ZipFile]::CreateFromDirectory(' +
        '$env:SERVER_BUNDLE_DIR, $env:SERVER_ZIP_PATH, ' +
        '[System.IO.Compression.CompressionLevel]::Optimal, $true)',
    ],
    serverDir,
    { ...process.env, SERVER_BUNDLE_DIR: bundleDir, SERVER_ZIP_PATH: zipPath }
  );
  console.log(`\nWindows bundle: ${bundleDir}\nZIP: ${zipPath}`);
}

main().catch(error => {
  console.error(`\n[build:winserver] ${error.message}`);
  process.exitCode = 1;
});
