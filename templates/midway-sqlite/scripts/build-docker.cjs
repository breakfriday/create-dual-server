const { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const serverDir = resolve(__dirname, '..');
function run(args) {
  const result = spawnSync('docker', args, { cwd: serverDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed (exit ${result.status})`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run build:docker -- [--no-export]\nDefaults to package.json name:version and exports name_version.tar for offline deployment. SERVER_IMAGE overrides the image tag. --export remains supported. Requires Docker with Linux containers.');
    return;
  }
  if (args.some(arg => !['--export', '--no-export'].includes(arg))) throw new Error('仅支持 --export、--no-export 和 --help');
  if (args.includes('--export') && args.includes('--no-export')) throw new Error('--export 与 --no-export 不能同时使用');
  if (!existsSync(join(serverDir, 'package-lock.json'))) {
    throw new Error('Missing package-lock.json. Run npm install and commit the lockfile before building.');
  }
  const { name, version, dualServer } = JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8'));
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(name)) throw new Error('package.json name 必须是适合作为 Docker 镜像名的非 scoped 名称');
  if (typeof version !== 'string' || !/^[0-9][a-zA-Z0-9_.-]{0,127}$/.test(version)) throw new Error('package.json version 必须是有效 Docker 标签（不支持 + 字符）');
  const artifactName = `${name}_${version}`;
  const buildId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
  const image = process.env.SERVER_IMAGE || `${name}:${version}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) throw new Error('SERVER_IMAGE 不是有效的镜像名称');
  const postgres = dualServer?.database === 'postgres';
  const postgresImage = 'postgres:17-bookworm';
  if (postgres) run(['pull', postgresImage]);
  run(['build', '-f', 'deploy/docker/Dockerfile', '-t', image, '.']);
  if (postgres) {
    const network = `${name}-probe-${buildId}`;
    const container = `${network}-postgres`;
    const password = randomBytes(32).toString('hex');
    run(['network', 'create', network]);
    try {
      run(['run', '-d', '--name', container, '--network', network,
        '-e', `POSTGRES_PASSWORD=${password}`, postgresImage]);
      // Wait inside the container without requiring a shell on the build host.
      run(['exec', container, 'sh', '-c', 'for i in $(seq 1 60); do pg_isready -h 127.0.0.1 -U postgres && exit 0; sleep 1; done; exit 1']);
      run(['run', '--rm', '--network', network,
        '-e', `PGHOST=${container}`, '-e', 'PGUSER=postgres', '-e', `PGPASSWORD=${password}`,
        image, 'node', 'scripts/smoke-production.cjs', '.', '--http']);
    } finally {
      // Cleanup must not hide an earlier build/test error.
      spawnSync('docker', ['rm', '-f', '-v', container], { cwd: serverDir, stdio: 'inherit' });
      spawnSync('docker', ['network', 'rm', network], { cwd: serverDir, stdio: 'inherit' });
    }
  }
  const output = join(serverDir, 'release', 'docker', `${artifactName}_${buildId}`);
  mkdirSync(output, { recursive: true });
  for (const name of ['compose.yaml', 'README.md']) copyFileSync(join(serverDir, 'deploy/docker', name), join(output, name));
  const uid = process.getuid?.() || 1000;
  const gid = process.getgid?.() || 1000;
  writeFileSync(join(output, '.env'), `SERVER_IMAGE=${image}\nSERVER_HTTP_PORT=__HTTP_PORT__\nSERVER_BIND_IP=0.0.0.0\nSERVER_UID=${uid}\nSERVER_GID=${gid}\nSERVER_DATA_PATH=./data\nSERVER_LOG_PATH=./logs\nCOOKIE_KEYS=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  if (postgres) {
    const envPath = join(output, '.env');
    const env = readFileSync(envPath, 'utf8')
      .replace('SERVER_DATA_PATH=./data', 'SERVER_UPLOAD_PATH=./data/uploads')
      .replace('SERVER_LOG_PATH=./logs', 'SERVER_LOG_PATH=./data/logs');
    writeFileSync(envPath, env + `POSTGRES_IMAGE=${postgresImage}\nPOSTGRES_CONTAINER_NAME=${name}-PostgreSQL\nPOSTGRES_USER=${name}\nPOSTGRES_DB=${name}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nPOSTGRES_DATA_PATH=./data/postgres\n`, { mode: 0o600 });
    for (const dir of ['postgres', 'uploads', 'logs']) mkdirSync(join(output, 'data', dir), { recursive: true });
  }
  if (!args.includes('--no-export')) run(['save', '--output', join(output, `${artifactName}.tar`), image, ...(postgres ? [postgresImage] : [])]);
  console.log(`\nDocker deployment: ${output}\nImage: ${image}\n请按 README.md 创建数据目录并启动；迁移到其他机器时检查 UID/GID。`);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(`[build:docker] ${error.message}`); process.exitCode = 1; }
}
module.exports = { main };
