import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.js';

const { Pool } = pg;

let _db: Kysely<DB> | undefined;

export function getDb(): Kysely<DB> {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://arena:arena_dev@localhost:5432/adrenax_arena';
    const isProduction = process.env.NODE_ENV === 'production';

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    });

    _db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool }),
    });
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = undefined;
  }
}
