// Apply supabase/migrations to a real Postgres.
//
//   npm run migrate -- --dry-run     what would run, and nothing else
//   npm run migrate                  apply what has not been applied
//   npm run migrate -- --baseline    record the history WITHOUT running it, for
//                                    a database whose schema is already there
//
// Until now every path that applied migrations targeted PGlite: the dev server
// applies them to `.pglite/` on first boot, and `db:verify` applies them to a
// throwaway instance. Nothing could apply them to a Supabase project, which
// made "point DATABASE_URL at Supabase and the same SQL runs there" — true of
// the seed since Session 1 — impossible to actually do without the Supabase CLI
// installed and linked.
//
// It records what it has applied, because these migrations are not idempotent
// and were never meant to be: they are a history, and a history replayed twice
// is not the same database. `schema_migrations` is that record, and its absence
// on a fresh project is what makes the first run apply everything.
//
// Each file runs inside its own transaction. Postgres has transactional DDL, so
// a migration that fails half way leaves nothing behind — which is the property
// that makes it safe to fix the file and run again.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: '.env.local' });
loadEnv();

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const DRY_RUN = process.argv.includes('--dry-run');
const BASELINE = process.argv.includes('--baseline');

const CONNECTION =
  process.env.DATABASE_URL ??
  `postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT ?? 5433}/postgres`;

const LEDGER = `
  create table if not exists schema_migrations (
    filename   text primary key,
    applied_at timestamptz not null default now()
  );
`;

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error('No migrations found');

  const client = new pg.Client({
    connectionString: CONNECTION,
    // Supabase terminates TLS at the pooler with a certificate chain node does
    // not carry. The same allowance scripts/seed.ts makes, for the same reason.
    ssl: CONNECTION.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
  });
  client.on('error', () => {});
  await client.connect();
  console.log(`migrating ${CONNECTION.replace(/:[^:@]+@/, ':***@')}`);

  try {
    await client.query(LEDGER);
    const { rows } = await client.query<{ filename: string }>(
      `select filename from schema_migrations`,
    );
    const applied = new Set(rows.map((row) => row.filename));

    // A database with a schema but no ledger was built by one of the other
    // paths — the dev server applies migrations to `.pglite/` itself, and never
    // wrote one. Running here would re-apply migration 1 against types that
    // already exist: the transaction rolls back and nothing breaks, but the
    // error explains nothing. This does.
    if (applied.size === 0 && (await hasSchema(client))) {
      if (!BASELINE) {
        throw new Error(
          [
            'This database already has a schema, but no record of which migrations',
            'produced it — so there is no safe way to tell what still needs applying.',
            'If it is up to date (the dev database applies migrations itself), run:',
            '  npm run migrate -- --baseline',
            'which records the history without running any of it.',
          ].join('\n'),
        );
      }
      for (const file of files) {
        await client.query(
          `insert into schema_migrations (filename) values ($1) on conflict do nothing`,
          [file],
        );
      }
      console.log(`  baselined ${files.length} migration(s) as already applied`);
      return;
    }
    if (BASELINE) {
      console.log('  --baseline had nothing to do: this database already has a ledger');
      return;
    }

    // Named rather than counted. A file that appears BEFORE the last applied one
    // means someone added a migration with an earlier timestamp — it will be
    // applied out of order relative to the history, and that is worth seeing
    // rather than discovering later.
    const pending = files.filter((file) => !applied.has(file));
    const last = [...applied].sort().pop();
    for (const file of pending) {
      if (last && file < last) {
        console.warn(`  WARNING  ${file} sorts before ${last}, which is already applied`);
      }
    }

    if (pending.length === 0) {
      console.log(`  nothing to do — all ${files.length} migration(s) already applied`);
      return;
    }

    if (DRY_RUN) {
      console.log(`  would apply ${pending.length} migration(s):`);
      for (const file of pending) console.log(`    ${file}`);
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(`insert into schema_migrations (filename) values ($1)`, [file]);
        await client.query('commit');
        console.log(`  applied  ${file}`);
      } catch (error) {
        await client.query('rollback');
        console.error(`  FAILED   ${file}`);
        throw error;
      }
    }

    console.log(`\n${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nMigration failed:\n', error);
  process.exitCode = 1;
});

/** Is there a schema here already? `requests` is the table nothing works without. */
async function hasSchema(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*) as count from information_schema.tables
      where table_schema = 'public' and table_name = 'requests'`,
  );
  return Number(rows[0].count) > 0;
}
