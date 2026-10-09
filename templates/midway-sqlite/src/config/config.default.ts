import { MidwayConfig } from '@midwayjs/core';
import { getDatabasePath, getHttpPort } from '../utils/deployment-config';
import { Note } from '../entity/note.entity';
import { CreateNotes1786320000000 } from '../migration/1786320000000-CreateNotes';

const production = process.env.NODE_ENV === 'production';

export default {
  keys: process.env.COOKIE_KEYS || 'local-development-only',
  koa: { port: getHttpPort() },
  ...(production ? { midwayLogger: { default: { dir: process.env.SERVER_LOG_DIR } } } : {}),
  typeorm: {
    // Midway otherwise removes the migration definitions before initializing TypeORM.
    allowExecuteMigrations: production,
    dataSource: {
      default: {
        type: 'better-sqlite3',
        database: getDatabasePath(),
        entities: [Note],
        migrations: [CreateNotes1786320000000],
        migrationsRun: production,
        synchronize: !production,
        logging: process.env.NODE_ENV === 'local',
      },
    },
  },
} as MidwayConfig;
