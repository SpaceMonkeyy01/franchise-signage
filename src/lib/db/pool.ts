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
      // One connection against the dev server, ten against Supabase's pooler.
      // PGlite is a single WASM Postgres behind a socket bridge and serves ONE
      // connection at a time: a second one is reset mid-query, which surfaces as
      // ECONNRESET the moment a page runs two queries in a Promise.all. Capping
      // the pool at one makes the pool itself the queue, so application code can
      // stay written the way it would be written against a real Postgres.
      max: process.env.DATABASE_URL ? 10 : 1,
      // And it must let go when idle, or the one connection is held forever and
      // nothing else on the machine — the seed, the smoke test, psql — can talk
      // to the dev database while `next dev` is running.
      idleTimeoutMillis: process.env.DATABASE_URL ? 30_000 : 500,
      ssl: process.env.DATABASE_URL?.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });

    // An idle client that dies emits on the POOL, and an unhandled 'error' event
    // takes the process down with it. Against the dev database that happens
    // routinely — it drops the connection whenever a second one is attempted —
    // so a script running beside `next dev` would crash rather than retry.
    globalForPool.__pgPool.on('error', (error) => {
      console.warn('[db] idle client error:', error.message);
    });

    // Same problem one level down: a socket that resets while a client is being
    // handed out raises on the CLIENT, and an EventEmitter with no 'error'
    // listener throws globally — killing a script mid-retry. The rejected query
    // still surfaces to the caller; this only stops the duplicate from being
    // fatal.
    globalForPool.__pgPool.on('connect', (client) => {
      client.on('error', () => {});
    });
  }
  return globalForPool.__pgPool;
}

/**
 * Retry a connection-level failure against the DEV database only.
 *
 * PGlite serves one connection at a time, so a script (`npm run sla`, the seed,
 * the smoke test) that asks while `next dev` holds the socket gets ECONNRESET —
 * a property of the stand-in, not of Postgres. Retrying briefly makes the two
 * coexist. Against a real database this is off: a dropped connection there means
 * something is wrong and should surface, not be papered over.
 */
async function withDevRetry<T>(run: () => Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL) return run();

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ECONNRESET' && code !== 'ECONNREFUSED') throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await withDevRetry(() => pool().query(text, params));
  return result.rows as T[];
}

export async function queryOne<T>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Close the pool.
 *
 * For one-shot scripts (`npm run sla`): exiting with a live pooled connection
 * makes `pg` emit "Connection terminated unexpectedly" from a socket nobody is
 * listening to any more. Long-running servers never call this.
 */
export async function closePool(): Promise<void> {
  const existing = globalForPool.__pgPool;
  if (!existing) return;
  globalForPool.__pgPool = undefined;
  await existing.end().catch(() => {});
}

/** Run a set of statements in one transaction — used by every write path. */
export async function transaction<T>(
  fn: (exec: {
    query: <R>(text: string, params?: unknown[]) => Promise<R[]>;
  }) => Promise<T>,
): Promise<T> {
  const client = await withDevRetry(() => pool().connect());
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
