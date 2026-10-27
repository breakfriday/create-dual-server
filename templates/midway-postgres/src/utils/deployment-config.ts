export function getPostgresConfig() {
  const port = Number(process.env.PGPORT || '5432');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PGPORT');
  if (!process.env.PGPASSWORD) throw new Error('PostgreSQL requires PGPASSWORD');
  return {
    type: 'postgres' as const,
    host: process.env.PGHOST || '127.0.0.1',
    port,
    username: process.env.PGUSER || '__APP_NAME__',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || '__APP_NAME__',
    connectTimeoutMS: 10000,
  };
}

export function getHttpPort(): number {
  const raw = process.env.SERVER_HTTP_PORT ?? '__HTTP_PORT__';
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) throw new Error('Invalid SERVER_HTTP_PORT');
  return port;
}
