// Do the policies actually stop anyone? (SPEC §10)
//
// Every session until now verified the RLS policies as valid SQL and never as
// behaviour, because the app connects as the table owner and an owner does not
// consult RLS. `docs/STATE.md` has called that the largest untested assumption
// in the build since Session 1, on the understanding that testing it needed a
// Supabase project or Docker.
//
// It does not. PGlite is real Postgres: it has real roles, and RLS is enforced
// against a role that does not own the table. The only genuinely absent pieces
// are the two INPUTS to the policies — the JWT GoTrue would mint and the header
// PostgREST would forward — and both are supplied here directly, through the
// same session GUCs `app.access_token()` and the stubbed `auth.jwt()` already
// read.
//
// So this is the real thing: two brands, two franchisees, two corporate links
// and a team member, and one question asked of every table — can the holder of
// one credential reach what belongs to another?

import type { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

import { freshDatabase } from './pglite-harness';

/** Returns null when the check passes, or the reason it did not. */
type Check = (db: PGlite) => Promise<string | null>;

interface NamedCheck {
  label: string;
  run: Check;
}

// ------------------------------------------------------------------ fixtures

/**
 * Two of everything, which is the only shape that can answer the question.
 *
 * One brand proves a token reads its own row; it takes a second brand, a second
 * location and a second franchisee to prove it reads nothing else. The tokens
 * are fixed strings rather than the column defaults so the tests can present
 * them — a franchisee's token is the plain value, and a corporate link's is
 * stored as its SHA-256, exactly as `mintCorporateLink` writes it.
 */
const ALPHA_TOKEN = 'alpha-request-token';
const ALPHA_DRAFT_TOKEN = 'alpha-changes-token';
const BETA_TOKEN = 'beta-request-token';
const ALPHA_REGISTRATION_TOKEN = 'alpha-registration-token';
const CORPORATE_ALPHA = 'corporate-alpha-token';
const CORPORATE_BETA = 'corporate-beta-token';
const CORPORATE_EXPIRED = 'corporate-expired-token';
const CORPORATE_REVOKED = 'corporate-revoked-token';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Ids captured while seeding, as the owner.
 *
 * The checks cannot look these up themselves: identifying "Beta's rows" by
 * joining `brands` is exactly what anon is forbidden to do, so a test written
 * that way fails on the wrong thing — `permission denied for table brands`
 * rather than an answer about scoping. Every table below carries `brand_id`
 * directly, so the ids are all a check needs.
 */
let betaBrandId = '';

async function seed(db: PGlite): Promise<void> {
  await db.exec(`
    insert into brands (name, slug, vendor_policy, status, corporate_cc, corporate_email,
                        reviewer_email)
      values ('Alpha Brand', 'alpha', 'signage_com', 'live', true, 'corp@alpha.test',
              'review@alpha.test'),
             ('Beta Brand', 'beta', 'signage_com', 'live', true, 'corp@beta.test',
              'review@beta.test');

    insert into master_catalog (placement, category, sign_type, variant, pricing_type,
                                pricing_basis, render_key)
      values ('outdoor', 'Illuminated', 'Channel Letters', 'Front-lit', 'Fabricated',
              'direct', 'channel-letters');

    -- One inactive item per brand, to prove the catalog's public read is scoped
    -- to the active flag rather than to "everything in the table".
    insert into brand_items (brand_id, master_catalog_id, name, est_price, active)
      select b.id, m.id, b.name || ' Letters', 5000, true from brands b, master_catalog m;
    insert into brand_items (brand_id, master_catalog_id, name, est_price, active)
      select b.id, m.id, b.name || ' Retired Sign', 1000, false from brands b, master_catalog m;

    insert into locations (brand_id, name, format)
      select id, name || ' Location', 'inline' from brands;

    insert into installed_signs (location_id, brand_item_id, sizing, installed_at)
      select l.id, bi.id, '24 inch', current_date
        from locations l
        join brand_items bi on bi.brand_id = l.brand_id and bi.active;
  `);

  // Requests carry fixed tokens: two for Alpha (one submitted, one reopened for
  // editing) and one for Beta.
  await db.exec(`
    insert into requests (brand_id, location_id, intent, status, access_token, requester_email)
      select b.id, l.id, 'add', 'submitted', '${ALPHA_TOKEN}', 'franchisee@alpha.test'
        from brands b join locations l on l.brand_id = b.id where b.slug = 'alpha';
    insert into requests (brand_id, location_id, intent, status, access_token, requester_email)
      select b.id, l.id, 'add', 'changes_requested', '${ALPHA_DRAFT_TOKEN}', 'franchisee@alpha.test'
        from brands b join locations l on l.brand_id = b.id where b.slug = 'alpha';
    insert into requests (brand_id, location_id, intent, status, access_token, requester_email)
      select b.id, l.id, 'add', 'submitted', '${BETA_TOKEN}', 'franchisee@beta.test'
        from brands b join locations l on l.brand_id = b.id where b.slug = 'beta';

    insert into line_items (request_id, brand_item_id, origin, item_status, est_price_snapshot)
      select r.id, bi.id, 'addon', 'pending_review', 5000
        from requests r
        join brand_items bi on bi.brand_id = r.brand_id and bi.active;

    insert into quotes (request_id, recipient_kind, recipient_email, priced_total, priced_count)
      select id, 'signage_com', 'quotes@signage.test', 5000, 1 from requests;

    insert into request_files (request_id, kind, storage_path, file_name)
      select id, 'placement_photo', 'photos/' || code || '.png', 'photo.png' from requests;

    insert into request_events (request_id, kind, actor, summary)
      select id, 'submitted', 'franchisee', 'Request submitted' from requests;

    insert into franchisee_registrations (brand_id, email, access_token)
      select id, 'signee@' || slug || '.test',
             case when slug = 'alpha' then '${ALPHA_REGISTRATION_TOKEN}' else 'beta-reg-token' end
        from brands;

    insert into team_members (email, name, active)
      values ('team@signage.test', 'On the team', true),
             ('former@signage.test', 'Left the company', false);
  `);

  // Four corporate links: one live per brand, plus an expired and a revoked one
  // for Alpha. Hashed exactly as src/lib/corporate/links.ts writes them.
  const beta = await db.query<{ id: string }>(`select id from brands where slug = 'beta'`);
  betaBrandId = beta.rows[0].id;

  await db.exec(`
    insert into corporate_links (brand_id, email, token_hash, expires_at)
      select id, 'review@alpha.test', '${sha256(CORPORATE_ALPHA)}', now() + interval '30 days'
        from brands where slug = 'alpha';
    insert into corporate_links (brand_id, email, token_hash, expires_at)
      select id, 'review@beta.test', '${sha256(CORPORATE_BETA)}', now() + interval '30 days'
        from brands where slug = 'beta';
    insert into corporate_links (brand_id, email, token_hash, expires_at)
      select id, 'review@alpha.test', '${sha256(CORPORATE_EXPIRED)}', now() - interval '1 day'
        from brands where slug = 'alpha';
    insert into corporate_links (brand_id, email, token_hash, expires_at, revoked_at)
      select id, 'review@alpha.test', '${sha256(CORPORATE_REVOKED)}', now() + interval '30 days',
             now()
        from brands where slug = 'alpha';
  `);
}

// -------------------------------------------------------------------- helpers

/** Become the anon role presenting `token` — a franchisee's link, or a corporate one. */
async function asAnon(db: PGlite, token: string | null): Promise<void> {
  await db.exec(`reset role;`);
  await db.exec(`set role anon;`);
  await db.exec(`set app.test_jwt = '';`);
  await db.exec(`set app.access_token = '${token ?? ''}';`);
}

/** Become an authenticated Supabase user with this email in their claims. */
async function asAuthenticated(db: PGlite, email: string): Promise<void> {
  await db.exec(`reset role;`);
  await db.exec(`set role authenticated;`);
  await db.exec(`set app.access_token = '';`);
  await db.exec(`set app.test_jwt = '${JSON.stringify({ email })}';`);
}

async function asOwner(db: PGlite): Promise<void> {
  await db.exec(`reset role; set app.access_token = ''; set app.test_jwt = '';`);
}

async function count(db: PGlite, sql: string): Promise<number> {
  const result = await db.query<{ n: string }>(sql);
  return Number(result.rows[0]?.n ?? -1);
}

/** How many rows a write touched — an RLS-blocked UPDATE touches none. */
async function affected(db: PGlite, sql: string): Promise<number> {
  const result = await db.query(sql);
  return result.affectedRows ?? 0;
}

/** Runs `sql` and reports whether Postgres refused it, and how. */
async function refusal(db: PGlite, sql: string): Promise<string | null> {
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
}

const expect = (condition: boolean, complaint: string): string | null =>
  condition ? null : complaint;

// --------------------------------------------------------------------- checks

const checks: NamedCheck[] = [
  // ------------------------------------------------- the franchisee's token
  {
    label: "a franchisee's token reads their own request",
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const rows = await db.query<{ access_token: string }>(`select access_token from requests`);
      return expect(
        rows.rows.length === 1 && rows.rows[0].access_token === ALPHA_TOKEN,
        `saw ${rows.rows.length} request(s): ${rows.rows.map((r) => r.access_token).join(', ')}`,
      );
    },
  },
  {
    // The headline. Same brand, different location, different franchisee.
    label: "and CANNOT read another franchisee's, in the same brand",
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const seen = await count(
        db,
        `select count(*) as n from requests where access_token = '${ALPHA_DRAFT_TOKEN}'`,
      );
      return expect(seen === 0, `reached ${seen} row(s) belonging to another token`);
    },
  },
  {
    label: "nor anything belonging to another brand",
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const requests = await count(
        db,
        `select count(*) as n from requests where access_token = '${BETA_TOKEN}'`,
      );
      const locations = await count(
        db,
        `select count(*) as n from locations where brand_id = '${betaBrandId}'`,
      );
      return expect(
        requests === 0 && locations === 0,
        `reached ${requests} beta request(s) and ${locations} beta location(s)`,
      );
    },
  },
  {
    label: 'anon holding no token reads no request at all',
    run: async (db) => {
      await asAnon(db, null);
      const seen = await count(db, `select count(*) as n from requests`);
      return expect(seen === 0, `reached ${seen} row(s) with no credential`);
    },
  },
  {
    // Each of these is a separate policy, and each is a separate way to leak the
    // same request. They are asserted one by one so a failure names the table.
    label: 'the request-scoped tables are scoped one by one',
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const leaks: string[] = [];
      for (const table of ['line_items', 'quotes', 'request_files', 'request_events']) {
        const mine = await count(
          db,
          `select count(*) as n from ${table} t
             join requests r on r.id = t.request_id
            where r.access_token = '${ALPHA_TOKEN}'`,
        );
        const theirs = await count(
          db,
          `select count(*) as n from ${table} t
             join requests r on r.id = t.request_id
            where r.access_token <> '${ALPHA_TOKEN}'`,
        );
        if (mine < 1) leaks.push(`${table}: could not see its own ${mine} row(s)`);
        if (theirs > 0) leaks.push(`${table}: reached ${theirs} row(s) of someone else's`);
      }
      return leaks.length === 0 ? null : leaks.join('; ');
    },
  },
  {
    label: 'a location and its installed signs follow the same token',
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const locations = await count(db, `select count(*) as n from locations`);
      const signs = await count(db, `select count(*) as n from installed_signs`);
      return expect(
        locations === 1 && signs === 1,
        `saw ${locations} location(s) and ${signs} installed sign(s), expected 1 and 1`,
      );
    },
  },
  {
    // `brands` carries reviewer_email, corporate_email and vendor_email, and RLS
    // cannot filter columns — so anon is kept off the table entirely and reads
    // the view instead.
    label: 'anon cannot read the brands table, and can read brands_public',
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const denied = await refusal(db, `select reviewer_email from brands`);
      const view = await count(db, `select count(*) as n from brands_public`);
      return expect(
        denied !== null && denied.includes('permission denied') && view === 2,
        `brands: ${denied ?? 'READABLE'} · brands_public rows: ${view}`,
      );
    },
  },
  {
    label: 'the public catalog is readable, and only where active',
    run: async (db) => {
      await asAnon(db, null);
      const active = await count(db, `select count(*) as n from brand_items where active`);
      const retired = await count(db, `select count(*) as n from brand_items where not active`);
      return expect(
        active === 2 && retired === 0,
        `${active} active and ${retired} inactive items visible`,
      );
    },
  },
  {
    // A franchisee may correct their own request while it is still theirs to
    // correct. Advancing status is the server's job.
    label: 'a franchisee may edit a reopened request, and not a submitted one',
    run: async (db) => {
      await asAnon(db, ALPHA_DRAFT_TOKEN);
      const reopened = await affected(
        db,
        `update requests set requester_phone = '555-0100'
          where access_token = '${ALPHA_DRAFT_TOKEN}'`,
      );
      await asAnon(db, ALPHA_TOKEN);
      const submitted = await affected(
        db,
        `update requests set requester_phone = '555-0100'
          where access_token = '${ALPHA_TOKEN}'`,
      );
      return expect(
        reopened === 1 && submitted === 0,
        `changes_requested: ${reopened} row(s) updated; submitted: ${submitted}`,
      );
    },
  },
  {
    // The timeline is the audit trail behind every approval and every lender
    // document. It is written by the transition helper and by nobody else.
    label: 'and cannot write to the timeline',
    run: async (db) => {
      await asAnon(db, ALPHA_TOKEN);
      const denied = await refusal(
        db,
        `insert into request_events (request_id, kind, actor, summary)
         select id, 'installed', 'franchisee', 'I marked this installed'
           from requests where access_token = '${ALPHA_TOKEN}'`,
      );
      return expect(denied !== null, 'anon inserted a request_event');
    },
  },
  {
    label: "a registration token reads its own row and no one else's",
    run: async (db) => {
      await asAnon(db, ALPHA_REGISTRATION_TOKEN);
      const rows = await db.query<{ email: string }>(
        `select email from franchisee_registrations`,
      );
      return expect(
        rows.rows.length === 1 && rows.rows[0].email === 'signee@alpha.test',
        `saw ${rows.rows.length}: ${rows.rows.map((r) => r.email).join(', ')}`,
      );
    },
  },

  // -------------------------------------------------- the corporate link
  {
    label: "a corporate link reads its own brand's whole program",
    run: async (db) => {
      await asAnon(db, CORPORATE_ALPHA);
      const requests = await count(db, `select count(*) as n from requests`);
      const locations = await count(db, `select count(*) as n from locations`);
      const registrations = await count(
        db,
        `select count(*) as n from franchisee_registrations`,
      );
      return expect(
        requests === 2 && locations === 1 && registrations === 1,
        `${requests} request(s), ${locations} location(s), ${registrations} registration(s)`,
      );
    },
  },
  {
    // The gap Session 6 opened, and the reason this suite exists at all:
    // app.corporate_brand() is a second anon-reachable predicate.
    label: "and reaches nothing of another brand's",
    run: async (db) => {
      await asAnon(db, CORPORATE_ALPHA);
      const leaks: string[] = [];
      const beta = await count(
        db,
        `select count(*) as n from requests where brand_id = '${betaBrandId}'`,
      );
      if (beta > 0) leaks.push(`${beta} beta request(s)`);
      for (const table of ['line_items', 'quotes', 'request_files', 'request_events']) {
        const seen = await count(
          db,
          `select count(*) as n from ${table} t
             join requests r on r.id = t.request_id
            where r.brand_id = '${betaBrandId}'`,
        );
        if (seen > 0) leaks.push(`${seen} beta ${table} row(s)`);
      }
      const signs = await count(
        db,
        `select count(*) as n from installed_signs s
           join locations l on l.id = s.location_id
          where l.brand_id = '${betaBrandId}'`,
      );
      if (signs > 0) leaks.push(`${signs} beta installed sign(s)`);
      const registrations = await count(
        db,
        `select count(*) as n from franchisee_registrations where brand_id = '${betaBrandId}'`,
      );
      if (registrations > 0) leaks.push(`${registrations} beta registration(s)`);
      return leaks.length === 0 ? null : `reached ${leaks.join(', ')}`;
    },
  },
  {
    // DECISIONS #75: the whole argument for a 30-day multi-use credential is
    // that it cannot change anything. verify-schema proves no policy grants it
    // a write; this proves a write actually fails.
    label: 'a corporate link cannot change anything it can see',
    run: async (db) => {
      await asAnon(db, CORPORATE_ALPHA);
      const updated = await affected(db, `update requests set requester_phone = '555-0199'`);
      const quoted = await affected(db, `update quotes set accepted_at = now()`);
      const inserted = await refusal(
        db,
        `insert into request_events (request_id, kind, actor, summary)
         select id, 'note', 'corporate', 'written from the dashboard' from requests limit 1`,
      );
      return expect(
        updated === 0 && quoted === 0 && inserted !== null,
        `updated ${updated} request(s), ${quoted} quote(s); insert ${inserted ?? 'SUCCEEDED'}`,
      );
    },
  },
  {
    label: 'an expired corporate link opens nothing',
    run: async (db) => {
      await asAnon(db, CORPORATE_EXPIRED);
      const seen = await count(db, `select count(*) as n from requests`);
      return expect(seen === 0, `an expired link reached ${seen} request(s)`);
    },
  },
  {
    label: 'and a revoked one opens nothing',
    run: async (db) => {
      await asAnon(db, CORPORATE_REVOKED);
      const seen = await count(db, `select count(*) as n from requests`);
      return expect(seen === 0, `a revoked link reached ${seen} request(s)`);
    },
  },
  {
    label: 'the links table itself is unreachable by anon',
    run: async (db) => {
      await asAnon(db, CORPORATE_ALPHA);
      const rows = await refusal(db, `select token_hash from corporate_links`);
      if (rows !== null) return null; // refused outright, which is stronger
      const seen = await count(db, `select count(*) as n from corporate_links`);
      return expect(seen === 0, `a corporate link enumerated ${seen} link row(s)`);
    },
  },

  // --------------------------------------------------------------- the team
  {
    // Team policies are unscoped by design — membership IS the scope.
    label: 'an allowlisted team member sees every brand',
    run: async (db) => {
      await asAuthenticated(db, 'team@signage.test');
      const requests = await count(db, `select count(*) as n from requests`);
      const brands = await count(db, `select count(*) as n from brands`);
      return expect(
        requests === 3 && brands === 2,
        `${requests} request(s) and ${brands} brand(s), expected 3 and 2`,
      );
    },
  },
  {
    label: 'a signed-in stranger sees nothing',
    run: async (db) => {
      await asAuthenticated(db, 'stranger@example.com');
      const requests = await count(db, `select count(*) as n from requests`);
      const brands = await count(db, `select count(*) as n from brands`);
      return expect(
        requests === 0 && brands === 0,
        `${requests} request(s) and ${brands} brand(s) reached without membership`,
      );
    },
  },
  {
    // Membership is re-checked on every request, so deactivating a row logs
    // someone out rather than waiting for a session to expire.
    label: 'and a deactivated member is locked out immediately',
    run: async (db) => {
      await asAuthenticated(db, 'former@signage.test');
      const requests = await count(db, `select count(*) as n from requests`);
      return expect(requests === 0, `a deactivated member reached ${requests} request(s)`);
    },
  },
];

// ----------------------------------------------------------------------- run

export interface RlsResult {
  label: string;
  failure: string | null;
}

/**
 * Run the suite against its own database.
 *
 * Its own, because these tests must start from a fixture they fully control:
 * the schema checks mutate rows, and "can this credential see that row" is not
 * a question worth asking about somebody else's leftovers.
 */
export async function runRlsChecks(): Promise<RlsResult[]> {
  const { db } = await freshDatabase();
  try {
    await seed(db);
    const results: RlsResult[] = [];
    for (const check of checks) {
      try {
        results.push({ label: check.label, failure: await check.run(db) });
      } catch (error) {
        // A check that throws is a failure, not a crashed run — most often
        // "permission denied", which is usually the right answer arriving in
        // the wrong shape, and the message says which.
        results.push({
          label: check.label,
          failure: `threw: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
        });
      } finally {
        await asOwner(db);
      }
    }
    return results;
  } finally {
    await db.close();
  }
}
