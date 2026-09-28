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

import {
  DEV_ADMIN,
  DEV_BRAND_ADMIN,
  DEV_BRAND_REVIEWER,
  DEV_FRANCHISEE,
  DEV_STAFF,
  seedDevAdmin,
  seedDevCorporate,
  seedDevFranchisee,
  seedDevStaff,
} from '../src/lib/auth/dev-auth';
import { seedFreshbites, seedMasterCatalog, seedPilotFranchisee } from './seed/apply';
import { seedDemoRequests } from './seed/demo-requests';

const DATA_DIR = join(process.cwd(), '.pglite');
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const PORT = Number(process.env.DEV_DB_PORT ?? 5433);

/**
 * Every migration a dev database could hold before this server kept a ledger.
 *
 * Until Sep 2026 an existing `.pglite/` was simply skipped, which meant a new
 * migration never reached it without a reset. A database with the schema and no
 * ledger was therefore built from exactly these files, and is baselined to them;
 * anything newer is applied.
 */
const PRE_LEDGER_MIGRATIONS = [
  '20260813090000_enums.sql',
  '20260813090100_catalog.sql',
  '20260813090200_workflow.sql',
  '20260813090300_did.sql',
  '20260813090400_rls.sql',
  '20260817090000_review_links.sql',
  '20260818090000_vendor_contacts.sql',
  '20260821090000_invoicing.sql',
  '20260824090000_welcome_access.sql',
  '20260824100000_package_fulfillment.sql',
  '20260825090000_corporate_access.sql',
];

/** Bring an existing dev database up to date. Returns false when there is none yet. */
async function applyPending(db: PGlite): Promise<boolean> {
  const existing = await db.query<{ count: string }>(
    `select count(*) as count from information_schema.tables
      where table_schema = 'public' and table_name = 'requests'`,
  );
  if (Number(existing.rows[0].count) === 0) return false;

  await db.exec(`create table if not exists dev_migrations (name text primary key)`);
  const recorded = await db.query<{ name: string }>(`select name from dev_migrations`);
  if (recorded.rows.length === 0) {
    for (const name of PRE_LEDGER_MIGRATIONS) {
      await db.query(`insert into dev_migrations (name) values ($1)`, [name]);
    }
  }

  const applied = new Set(
    (await db.query<{ name: string }>(`select name from dev_migrations`)).rows.map((r) => r.name),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((file) => !applied.has(file));
  for (const file of pending) {
    await db.exec('begin');
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      await db.query(`insert into dev_migrations (name) values ($1)`, [file]);
      await db.exec('commit');
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
    console.log(`[dev-db] applied ${file}`);
  }
  if (pending.length === 0) console.log('[dev-db] schema up to date');
  return true;
}

async function migrateAndSeed(db: PGlite): Promise<void> {
  if (await applyPending(db)) return;

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

  await db.exec(`create table if not exists dev_migrations (name text primary key)`);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    await db.query(`insert into dev_migrations (name) values ($1)`, [file]);
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
  // Every start, so an existing database gains them too (SPEC v2.3 §10.6).
  await seedDevAdmin(db);
  const pilotFranchisee = await seedPilotFranchisee(db);
  await seedDevFranchisee(db, pilotFranchisee);
  await seedDevStaff(db, pilotFranchisee);
  await seedDevCorporate(db, 'freshbites');
  console.log(`[dev-db] Signage.com: ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`);
  console.log(`[dev-db] franchisee:  ${DEV_FRANCHISEE.email} / ${DEV_FRANCHISEE.password}`);
  console.log(`[dev-db] staff:       ${DEV_STAFF.email} / ${DEV_STAFF.password} (${DEV_STAFF.store} only)`);
  console.log(`[dev-db] brand admin: ${DEV_BRAND_ADMIN.email} / ${DEV_BRAND_ADMIN.password}`);
  console.log(`[dev-db] reviewer:    ${DEV_BRAND_REVIEWER.email} / ${DEV_BRAND_REVIEWER.password}`);

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
