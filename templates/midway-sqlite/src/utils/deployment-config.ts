import { isAbsolute, join } from 'node:path';

export function getDatabasePath(): string {
  if (process.env.NODE_ENV !== 'production') return join(__dirname, '../../dev.sqlite');
  const dir = process.env.SERVER_DATA_DIR;
  if (!dir || !isAbsolute(dir)) throw new Error('Production requires an absolute SERVER_DATA_DIR');
  return join(dir, 'server.sqlite');
}

export function getHttpPort(): number {
  const raw = process.env.SERVER_HTTP_PORT ?? '__HTTP_PORT__';
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) throw new Error('Invalid SERVER_HTTP_PORT');
  return port;
}
