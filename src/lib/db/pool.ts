// The database connection.
//
// One client (`pg`), one dialect (SQL), two possible targets: the local dev
// database (scripts/dev-db-server.ts) or a Supabase project's Postgres. The
// application cannot tell them apart, which is the point — nothing developed
// locally is developed against a mock.
//
// DATABASE_URL selects the target. Unset, it falls back to the dev server.

import { Pool, types } from 'pg';

// pg returns numerics as strings to avoid silently losing precision on bigints.
// Prices are numeric(12,2) and are formatted for display, never summed as
// floats in JS, so the string is what we want — left as-is deliberately rather
// than parsed, so nobody adds two prices and gets 8399.999999999999.
types.setTypeParser(types.builtins.NUMERIC, (value) => value);

const DEV_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${
  process.env.DEV_DB_PORT ?? 5433
}/postgres`;

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

export function pool(): Pool {
  if (!globalForPool.__pgPool) {
    const connectionString = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
    globalForPool.__pgPool = new Pool({
      connectionString,
      // The dev server is a single WASM Postgres; a large pool buys nothing and
      // costs connection churn. Supabase sits behind its own pooler.
      max: process.env.DATABASE_URL ? 10 : 4,
      ssl: process.env.DATABASE_URL?.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForPool.__pgPool;
}

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a set of statements in one transaction — used by every write path. */
export async function transaction<T>(
  fn: (exec: {
    query: <R>(text: string, params?: unknown[]) => Promise<R[]>;
  }) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('begin');
    const result = await fn({
      query: async <R>(text: string, params: unknown[] = []) =>
        (await client.query(text, params)).rows as R[],
    });
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
