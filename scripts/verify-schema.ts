// Apply every migration to a throwaway in-process Postgres and assert the shape.
//
//   npm run db:verify
//
// This exists because `supabase start` needs Docker, and the schema should not
// be unverifiable on a machine that does not have it. PGlite is real Postgres
// compiled to WASM, so a migration that applies here is valid SQL against the
// same engine version family Supabase runs.
//
// What it does NOT cover: the Supabase platform pieces PGlite has no notion of —
// the real `auth` schema, GoTrue, Storage, and how PostgREST populates
// `request.headers`. Those are stubbed below, so RLS policies are checked for
// validity, not for behaviour. Behavioural RLS tests belong in an integration
// suite once Docker is available.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
// Supabase ships pgcrypto enabled; PGlite needs it loaded explicitly. The
// migrations use it for requests.access_token defaults (gen_random_bytes).
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

// Supabase provides these; PGlite does not.
const PLATFORM_STUB = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema if not exists auth;
  -- Real Supabase reads the verified JWT. The stub returns an empty claim set,
  -- which is enough for the policy expressions to type-check.
  create or replace function auth.jwt() returns jsonb
    language sql stable as $$ select '{}'::jsonb $$;
`;

interface Check {
  label: string;
  sql: string;
  expect: (rows: Record<string, unknown>[]) => boolean;
  describe: (rows: Record<string, unknown>[]) => string;
}

const checks: Check[] = [
  {
    label: 'all SPEC §2–§5 tables exist',
    sql: `select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'
          order by table_name`,
    expect: (rows) => {
      const names = new Set(rows.map((r) => r.table_name));
      return [
        'master_catalog', 'brands', 'brand_items', 'brand_packages', 'locations',
        'installed_signs', 'requests', 'line_items', 'request_files', 'request_events',
        'change_requests', 'quotes', 'did_requests', 'team_members',
        'franchisee_registrations',
      ].every((t) => names.has(t));
    },
    describe: (rows) => `${rows.length} tables: ${rows.map((r) => r.table_name).join(', ')}`,
  },
  {
    label: 'the §8b financing and landlord fields are on requests',
    sql: `select column_name from information_schema.columns
          where table_name = 'requests'
            and column_name in ('financing_involved', 'landlord_contact', 'package_version')`,
    expect: (rows) => rows.length === 3,
    describe: (rows) => rows.map((r) => r.column_name).join(', '),
  },
  {
    label: 'landlord_criteria is a request_files kind',
    sql: `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'request_file_kind' order by e.enumsortorder`,
    expect: (rows) => rows.some((r) => r.enumlabel === 'landlord_criteria'),
    describe: (rows) => rows.map((r) => r.enumlabel).join(', '),
  },
  {
    label: 'HARD RULE: did_signature_status cannot reach `signed`',
    sql: `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'did_signature_status' order by e.enumsortorder`,
    expect: (rows) => {
      const labels = rows.map((r) => r.enumlabel);
      return labels.length === 2 && !labels.includes('signed');
    },
    describe: (rows) => rows.map((r) => r.enumlabel).join(', '),
  },
  {
    label: 'did_requests is decoupled from locations (nullable FK)',
    sql: `select is_nullable from information_schema.columns
          where table_name = 'did_requests' and column_name = 'location_id'`,
    expect: (rows) => rows[0]?.is_nullable === 'YES',
    describe: (rows) => `location_id nullable = ${rows[0]?.is_nullable}`,
  },
  {
    label: 'request_events.kind is unconstrained text (phase-2 permit stages)',
    sql: `select c.data_type,
                 (select count(*) from pg_constraint con
                   join pg_class cl on cl.oid = con.conrelid
                  where cl.relname = 'request_events' and con.contype = 'c') as check_count
          from information_schema.columns c
          where c.table_name = 'request_events' and c.column_name = 'kind'`,
    expect: (rows) => rows[0]?.data_type === 'text' && Number(rows[0]?.check_count) === 0,
    describe: (rows) => `${rows[0]?.data_type}, ${rows[0]?.check_count} check constraints`,
  },
  {
    label: 'request_events is append-only',
    sql: `select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where c.relname = 'request_events' and not t.tgisinternal`,
    expect: (rows) => rows.some((r) => r.tgname === 'request_events_append_only'),
    describe: (rows) => rows.map((r) => r.tgname).join(', '),
  },
  {
    label: 'RLS is enabled on every workflow table',
    sql: `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    expect: (rows) => rows.length === 0,
    describe: (rows) =>
      rows.length === 0 ? 'all enabled' : `missing on: ${rows.map((r) => r.relname).join(', ')}`,
  },
  {
    label: 'anon reaches requests only through a token policy',
    sql: `select polname, pg_get_expr(polqual, polrelid) as using_expr
          from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.relname = 'requests'`,
    expect: (rows) =>
      rows.some(
        (r) =>
          String(r.polname).includes('token') && String(r.using_expr).includes('app.access_token'),
      ),
    describe: (rows) => rows.map((r) => r.polname).join(', '),
  },
  {
    // SPEC §8d level 1. The DID migration locked this table to anon outright;
    // the welcome email's landing page reads it, so the predicate is now the
    // token. The check is that it is STILL a token — an accidental `using
    // (true)` here would publish every franchisee's address in the pilot.
    label: 'anon reaches a registration only through its own token',
    sql: `select polname, pg_get_expr(polqual, polrelid) as using_expr
          from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.relname = 'franchisee_registrations'`,
    expect: (rows) => {
      const anon = rows.filter((r) => !String(r.polname).startsWith('team'));
      return (
        anon.length > 0 &&
        anon.every((r) => String(r.using_expr).includes('app.access_token'))
      );
    },
    describe: (rows) => rows.map((r) => r.polname).join(', '),
  },
  {
    // DECISIONS #20: routing groups by resolved policy, so two contacts for the
    // same policy would make the recipient ambiguous — and the failure mode of
    // an ambiguous recipient is mailing one vendor's package to another.
    label: 'a brand has at most one vendor contact per policy',
    sql: `select con.conname from pg_constraint con
           join pg_class c on c.oid = con.conrelid
          where c.relname = 'brand_vendor_contacts' and con.contype = 'u'`,
    expect: (rows) => rows.some((r) => r.conname === 'brand_vendor_contacts_one_per_policy'),
    describe: (rows) => rows.map((r) => r.conname).join(', ') || '(none)',
  },
  {
    label: 'brands_public exposes no contact emails',
    sql: `select column_name from information_schema.columns where table_name = 'brands_public'`,
    expect: (rows) => !rows.some((r) => String(r.column_name).includes('email')),
    describe: (rows) => rows.map((r) => r.column_name).join(', '),
  },
  {
    // Found by running the seed twice: with ON DELETE SET NULL, deleting an
    // installed sign fired an update that violated the replacement item's own
    // check constraint. History a live request points at must not be deletable.
    label: 'deleting an installed sign a replacement points at is refused',
    sql: `select con.confdeltype from pg_constraint con
           join pg_class c on c.oid = con.conrelid
          where c.relname = 'line_items' and con.conname = 'line_items_replaces_sign_fk'`,
    // 'r' = RESTRICT, 'n' = SET NULL
    expect: (rows) => rows[0]?.confdeltype === 'r',
    describe: (rows) => `on delete = ${rows[0]?.confdeltype ?? '(constraint missing)'}`,
  },
  {
    // §8b: Signage.com invoices its own work only. An external package is
    // quoted, ordered and invoiced by the brand's vendor directly (DECISIONS
    // #46), so an invoice number on one would put Signage.com's letterhead on
    // money that never passes through Signage.com — the one thing a lender
    // document must not get wrong.
    label: 'only an internal package can be invoiced, and nothing is paid unbilled',
    sql: `select conname from pg_constraint con join pg_class c on c.oid = con.conrelid
          where c.relname = 'quotes' and con.contype = 'c'`,
    expect: (rows) => {
      const names = rows.map((r) => r.conname);
      return (
        names.includes('quotes_only_internal_is_invoiced') &&
        names.includes('quotes_paid_needs_invoice') &&
        names.includes('quotes_invoice_issued_together') &&
        names.includes('quotes_payment_recorded_together')
      );
    },
    describe: (rows) => rows.map((r) => r.conname).join(', '),
  },
  {
    // SPEC §6, amended v2.2. The package's stage is DERIVED from these dates, so
    // an out-of-order write does not produce an error — it produces a package
    // that silently reads as shipped without ever having been accepted. The
    // ordering belongs in the database for the same reason the invoice rules do.
    label: 'a package cannot skip its own tail, and only ours has production',
    sql: `select conname from pg_constraint con join pg_class c on c.oid = con.conrelid
          where c.relname = 'quotes' and con.contype = 'c'`,
    expect: (rows) => {
      const names = rows.map((r) => r.conname);
      return [
        'quotes_external_has_no_production',
        'quotes_accepted_after_delivered',
        'quotes_production_after_accepted',
        'quotes_shipped_after_production',
        'quotes_completed_after_accepted',
      ].every((name) => names.includes(name));
    },
    describe: (rows) =>
      rows
        .map((r) => String(r.conname))
        .filter((n) => n.startsWith('quotes_') && !n.includes('invoice') && !n.includes('paid'))
        .join(', '),
  },
  {
    label: 'the replacement/exception invariants are enforced in the database',
    sql: `select conname from pg_constraint con join pg_class c on c.oid = con.conrelid
          where c.relname = 'line_items' and con.contype = 'c'`,
    expect: (rows) => {
      const names = rows.map((r) => r.conname);
      return (
        names.includes('line_items_replacement_fields') &&
        names.includes('line_items_exception_has_issue')
      );
    },
    describe: (rows) => rows.map((r) => r.conname).join(', '),
  },
];

/**
 * Walk the demo's storyline in SQL.
 *
 * Checking that constraints EXIST is not the same as checking they let the real
 * flow through — a check constraint written slightly wrong passes inspection and
 * then blocks every replacement request. This runs REQ-0017 (the fast lane)
 * end to end: Oak Plaza with an installed menu board, a like-for-like
 * replacement against it, and the completed writeback that updates the record
 * in place.
 */
async function smokeTest(db: PGlite): Promise<string[]> {
  const failures: string[] = [];
  const fail = (what: string, error: unknown) =>
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);

  try {
    await db.exec(`
      insert into brands (name, slug, vendor_policy, vendor_name, vendor_email,
                          corporate_cc, corporate_email, status)
        values ('Freshbites', 'freshbites', 'signage_com', 'Signage.com Manufacturing',
                'quotes@signage.com', true, 'brand@freshbites.com', 'live');

      insert into master_catalog (placement, category, sign_type, variant, pricing_type,
                                  pricing_basis, render_key)
        values ('indoor', 'Illuminated', 'Lightbox/Cabinet Signs',
                'Standard Cabinet (Square/Rectangle)', 'Fabricated Lightbox - Single Sided',
                'direct', 'light-box');

      insert into brand_items (brand_id, master_catalog_id, name, spec_summary, est_price)
        select b.id, m.id, 'Freshbites Menu Board', '3-panel lightbox · matte diffuser', 3200
          from brands b, master_catalog m;

      insert into locations (brand_id, name, format, opening_date)
        select id, 'Freshbites — Oak Plaza', 'inline', date '2025-09-15' from brands;

      insert into installed_signs (location_id, brand_item_id, sizing, installed_at)
        select l.id, bi.id, '3 panels', date '2025-10-01' from locations l, brand_items bi;

      insert into requests (brand_id, location_id, intent, status, financing_involved)
        select b.id, l.id, 'replace_like', 'submitted', true from brands b, locations l;

      insert into line_items (request_id, brand_item_id, origin, item_status, sizing,
                              replaces_sign_id, replace_reason, est_price_snapshot)
        select r.id, bi.id, 'replacement', 'auto_approved', '3 panels', s.id, 'damaged', 3200
          from requests r, brand_items bi, installed_signs s;
    `);
  } catch (error) {
    fail('seeding the storyline', error);
    return failures;
  }

  // The human-facing codes the demo shows.
  const codes = await db.query<{ code: string }>(`select code from requests`);
  if (!/^REQ-\d{4}$/.test(codes.rows[0]?.code ?? '')) {
    failures.push(`request code is "${codes.rows[0]?.code}", expected REQ-nnnn`);
  }

  // A token is minted automatically — a franchisee link never depends on the
  // application remembering to generate one.
  const token = await db.query<{ access_token: string }>(`select access_token from requests`);
  if ((token.rows[0]?.access_token ?? '').length < 32) {
    failures.push('requests.access_token did not default to a random value');
  }

  // The replacement invariant must permit a real replacement...
  try {
    await db.exec(`
      insert into line_items (request_id, brand_item_id, origin, item_status)
        select r.id, bi.id, 'standard', 'auto_approved' from requests r, brand_items bi;
    `);
  } catch (error) {
    fail('a standard item alongside a replacement', error);
  }

  // ...and must reject a replacement that names no target.
  try {
    await db.exec(`
      insert into line_items (request_id, brand_item_id, origin, item_status)
        select r.id, bi.id, 'replacement', 'auto_approved' from requests r, brand_items bi;
    `);
    failures.push('a replacement with no replaces_sign_id was accepted');
  } catch {
    /* expected */
  }

  // The writeback: a replacement updates the installed row rather than adding one.
  try {
    await db.exec(`
      update installed_signs s
         set sizing = li.sizing, source_line_item_id = li.id, installed_at = current_date
        from line_items li
       where li.replaces_sign_id = s.id;
      update requests set status = 'completed';
    `);
    const signs = await db.query<{ count: string }>(`select count(*) from installed_signs`);
    if (Number(signs.rows[0].count) !== 1) {
      failures.push(`writeback left ${signs.rows[0].count} installed signs, expected 1`);
    }
  } catch (error) {
    fail('the installed_signs writeback', error);
  }

  // The event log refuses to be rewritten.
  try {
    await db.exec(`
      insert into request_events (request_id, kind, actor, summary, from_status, to_status)
        select id, 'installed', 'team', 'Marked installed', 'shipped', 'completed' from requests;
      update request_events set summary = 'tampered';
    `);
    failures.push('request_events accepted an UPDATE');
  } catch (error) {
    if (!String(error).includes('append-only')) fail('the append-only trigger', error);
  }

  return failures;
}

async function main() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_STUB);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('No migrations found');

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`  applied  ${file}`);
    } catch (error) {
      console.error(`  FAILED   ${file}`);
      throw error;
    }
  }

  console.log('');
  let failures = 0;
  for (const check of checks) {
    const result = await db.query<Record<string, unknown>>(check.sql);
    const passed = check.expect(result.rows);
    if (!passed) failures += 1;
    console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${check.label}`);
    if (!passed) console.log(`          got: ${check.describe(result.rows)}`);
  }

  console.log('');
  const smokeFailures = await smokeTest(db);
  for (const failure of smokeFailures) console.log(`  FAIL  storyline — ${failure}`);
  if (smokeFailures.length === 0) {
    console.log('  ok    the demo storyline runs end to end (REQ-0017 fast lane)');
  }

  await db.close();

  const total = failures + smokeFailures.length;
  if (total > 0) {
    console.error(`\n${total} schema check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(
      `\n${files.length} migrations applied, ${checks.length + 1} checks passed.`,
    );
  }
}

main().catch((error) => {
  console.error('\nSchema verification failed:\n', error);
  process.exitCode = 1;
});
