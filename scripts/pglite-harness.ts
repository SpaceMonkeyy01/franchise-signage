// A throwaway Postgres with every migration applied.
//
// Shared by `verify-schema.ts` (is the shape right?) and `rls-behaviour.ts`
// (do the policies actually stop anyone?), which want the same database and must
// not share an instance: the schema checks mutate data, and an access-control
// test that runs against somebody else's leftovers is testing nothing.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
// Supabase ships pgcrypto enabled; PGlite needs it loaded explicitly. The
// migrations use it for access_token defaults (gen_random_bytes) and for the
// corporate link's token hashing (digest).
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

/**
 * The Supabase platform pieces PGlite has no notion of.
 *
 * The roles and the `auth` schema are real enough for the policies to be
 * enforced against — which, contrary to what this file used to claim, means RLS
 * *behaviour* is testable here and does not need Docker. What is still absent is
 * GoTrue and PostgREST: nothing issues a real JWT, and nothing populates
 * `request.headers`. Both are inputs to the policies rather than parts of them,
 * so the tests supply them directly — `app.access_token()` already falls back to
 * a session GUC for exactly this reason, and `auth.jwt()` is stubbed to read
 * one too.
 */
export const PLATFORM_STUB = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema if not exists auth;
  -- Real Supabase reads the verified JWT. This returns whatever the session put
  -- in app.test_jwt, so a test can be a particular signed-in person — and an
  -- empty claim set, which is what the policies see by default, when it does not.
  create or replace function auth.jwt() returns jsonb
    language sql stable as $$
      select coalesce(nullif(current_setting('app.test_jwt', true), '')::jsonb, '{}'::jsonb)
    $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`;

export interface FreshDatabase {
  db: PGlite;
  /** Migration filenames, in the order they were applied. */
  applied: string[];
}

export async function freshDatabase(options: { log?: boolean } = {}): Promise<FreshDatabase> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_STUB);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error('No migrations found');

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      if (options.log) console.log(`  applied  ${file}`);
    } catch (error) {
      if (options.log) console.error(`  FAILED   ${file}`);
      throw error;
    }
  }

  return { db, applied: files };
}
