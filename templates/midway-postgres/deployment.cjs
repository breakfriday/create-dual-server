const { readFileSync, mkdirSync } = require('node:fs');
const { dirname, isAbsolute, resolve, join } = require('node:path');

// Execute before loading Midway: environment > JSON > defaults.
function configureProduction(appDir, env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  let config = {};
  if (env.SERVER_CONFIG_FILE !== undefined) {
    if (!isAbsolute(env.SERVER_CONFIG_FILE)) throw new Error('SERVER_CONFIG_FILE must be an absolute path');
    config = JSON.parse(readFileSync(env.SERVER_CONFIG_FILE, 'utf8').replace(/^\uFEFF/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('server.json must contain a JSON object');
    }
  }
  const configDir = env.SERVER_CONFIG_FILE ? dirname(env.SERVER_CONFIG_FILE) : appDir;
  const next = {};
  for (const [variable, key] of [['SERVER_UPLOAD_DIR', 'uploadDir'], ['SERVER_LOG_DIR', 'logDir']]) {
    if (env[variable] !== undefined) {
      if (!env[variable].trim() || !isAbsolute(env[variable])) throw new Error(`${variable} must be an absolute path`);
      next[variable] = env[variable];
    } else if (config[key] !== undefined) {
      if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`${key} must be a non-empty path`);
      next[variable] = resolve(configDir, config[key]);
    }
  }
  next.SERVER_UPLOAD_DIR ||= join(appDir, 'data', 'uploads');
  next.SERVER_LOG_DIR ||= join(appDir, 'data', 'logs');
  if (!env.PGPASSWORD) throw new Error('PostgreSQL requires PGPASSWORD');
  const rawPort = env.SERVER_HTTP_PORT ?? config.httpPort ?? __HTTP_PORT__;
  if (!['number', 'string'].includes(typeof rawPort) || !/^\d+$/.test(String(rawPort)) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('httpPort / SERVER_HTTP_PORT must be an integer from 1 to 65535');
  }
  next.SERVER_HTTP_PORT = String(Number(rawPort));
  const keys = env.COOKIE_KEYS ?? config.cookieKeys;
  if (typeof keys !== 'string' || !keys.trim()) throw new Error('Production requires COOKIE_KEYS or cookieKeys in server.json');
  next.COOKIE_KEYS = keys;
  // Validate everything before modifying the environment or creating directories.
  for (const dir of [next.SERVER_UPLOAD_DIR, next.SERVER_LOG_DIR]) mkdirSync(dir, { recursive: true });
  Object.assign(env, next);
}

module.exports = { configureProduction };
