// A local Postgres for development, with no Docker.
//
//   npm run dev        — starts this alongside next dev
//   npm run dev:db     — just this
//   npm run dev:db -- --reset  — wipe and re-seed
//
// PGlite is Postgres compiled to WASM. Run in-process inside Next it deadlocks:
// the dev server uses several worker processes and a file-backed PGlite can only
// be opened by one. So it runs here instead, as its own process speaking the
// real Postgres wire protocol on port 5433. Next connects to it with `pg` — the
// same client, and the same SQL, that will later point at Supabase. Nothing in
// the application knows which one it is talking to.
//
// It applies supabase/migrations and the real seed, so development runs against
// the actual schema. What it is NOT: Supabase. No GoTrue, no Storage, and no
// PostgREST — so the RLS policies exist but are never consulted, because this
// connects as the table owner. Token scoping is enforced in the SQL of
// src/lib/db/queries.ts, which mirrors the policies statement for statement.

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

import { seedFreshbites, seedMasterCatalog } from './seed/apply';
import { seedDemoRequests } from './seed/demo-requests';

const DATA_DIR = join(process.cwd(), '.pglite');
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const PORT = Number(process.env.DEV_DB_PORT ?? 5433);

async function migrateAndSeed(db: PGlite): Promise<void> {
  const existing = await db.query<{ count: string }>(
    `select count(*) as count from information_schema.tables
      where table_schema = 'public' and table_name = 'requests'`,
  );
  if (Number(existing.rows[0].count) > 0) {
    console.log('[dev-db] schema already present — skipping migrations');
    return;
  }

  // Supabase provides these roles and the auth schema; PGlite does not. Stubbing
  // them lets the RLS migration apply unchanged — one schema, both targets.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${role}') then
        create role ${role};
      end if;
    end $$;`);
  }
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb
      language sql stable as $$ select '{}'::jsonb $$;
  `);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    console.log(`[dev-db] applied ${file}`);
  }

  const masterIds = await seedMasterCatalog(db);
  const brand = await seedFreshbites(db, masterIds);
  await seedDemoRequests(db, brand);
  console.log('[dev-db] seeded Freshbites, Oak Plaza, Cedar Park and the three demo requests');
}

async function main() {
  if (process.argv.includes('--reset')) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('[dev-db] reset — removed .pglite');
  }

  const db = new PGlite(DATA_DIR, { extensions: { pgcrypto } });
  await db.waitReady;
  await migrateAndSeed(db);

  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await server.start();
  console.log(`[dev-db] listening on postgres://postgres@127.0.0.1:${PORT}/postgres`);

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[dev-db] failed to start:', error);
  process.exit(1);
});
