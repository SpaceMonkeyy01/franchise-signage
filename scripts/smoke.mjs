// Browser smoke test of the franchisee flow.
//
//   npm run smoke          (needs `npm run dev` already running)
//
// Drives the real app in a real browser, because a page that renders is not the
// same as a page that works — the accept-quote button either moves the request
// and writes its event, or it does not.
//
// Every assertion auto-waits. Next navigates on the client, so a plain
// `.count()` races the render and reports a failure the app does not have.
//
// It MUTATES the dev database: it accepts a quote, submits three new requests
// and creates a location. Reset with `npm run dev:db:reset`.
//
// The dev database serves ONE connection at a time (PGlite behind a socket
// bridge), so the direct-SQL helpers here connect, do their work and disconnect
// — and retry, because `next dev` may be holding the connection when they ask.

import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium } from 'playwright';
import pg from 'pg';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const TIMEOUT = 15_000;
const results = [];

/** The location the initial-setup section creates, and then removes. */
const SMOKE_LOCATION = 'Freshbites — Smoke Test';

/** The §8d registration the welcome section creates, and then removes. */
const SMOKE_REGISTRATION = 'smoke.franchisee@freshbites.test';
/** Registered from the corporate dashboard rather than the team queue (§8d). */
const SMOKE_CORPORATE_REGISTRATION = 'smoke.corporate@freshbites.test';
/** Registered from the People tab's Franchisees section, and cleared by every run. */
const SMOKE_PEOPLE_REGISTRATION = 'smoke.people@freshbites.test';
/** Freshbites' corporate accounts, seeded by the dev database (SPEC v2.3 §10.6). */
const BRAND_ADMIN = { email: 'brand@freshbites.com', password: 'corporate-dev-password' };
const BRAND_REVIEWER = { email: 'reviewer@freshbites.com', password: 'reviewer-dev-password' };
/** The pilot company's store manager, assigned Oak Plaza only (§9b phase D). */
const DEV_STAFF = { email: 'riley@freshbites-austin.com', password: 'staff-dev-password' };
/** Invited by the owner from Store staff, and cleared by every run. */
const SMOKE_STAFF = 'smoke.manager@freshbites-austin.test';
/** Invited from the dashboard's People tab, and cleared by every run. */
const SMOKE_CORPORATE_INVITEE = 'smoke.reviewer@freshbites.test';

/** A 1×1 PNG — the smallest thing that exercises the real upload path. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The seeded dev admin (src/lib/auth/dev-auth.ts). Its password and
 * authenticator secret are published there on purpose: the account exists only
 * in the dev database, and this suite has to be able to type both.
 */
const DEV_ADMIN = {
  email: 'team@signage.com',
  password: 'signage-dev-password',
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
};

/** The seeded pilot franchisee owner (src/lib/auth/dev-auth.ts) — Dana. */
const DEV_FRANCHISEE = { email: 'dana@freshbites-austin.com', password: 'franchisee-dev-password' };

/** The Signage.com admin the accounts section invites, and then removes. */
const SMOKE_ADMIN = 'smoke.admin@signage.test';
const SMOKE_ADMIN_PASSWORD = 'smoke-admin-password-1';

/**
 * RFC 6238, as every authenticator app computes it — the same algorithm as
 * src/lib/auth/totp.ts, restated because this file cannot import TypeScript.
 */
function totpCode(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret.toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** Password, then the authenticator code — the whole Signage.com sign-in. */
async function signInAsAdmin(page, { email, password, totpSecret }) {
  await page.goto(`${BASE}/sign-in?next=/admin`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/two-factor**', { timeout: TIMEOUT });
  await page.getByLabel('Six-digit code').fill(totpCode(totpSecret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/admin$/, { timeout: TIMEOUT });
}

/** Password only — franchisees and corporate, whom nothing forces to a second factor. */
async function signInWithPassword(page, { email, password }, next) {
  const target = next ? `${BASE}/sign-in?next=${encodeURIComponent(next)}` : `${BASE}/sign-in`;
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const record = (label, passed, detail = '') => {
  results.push({ label, passed });
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Assert a locator settles at an expected count, rather than sampling once. */
async function expectCount(page, selector, expected, label) {
  const locator = page.locator(selector);
  const deadline = Date.now() + TIMEOUT;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = await locator.count();
    if (seen === expected) return record(label, true);
    await page.waitForTimeout(150);
  }
  record(label, false, `expected ${expected}, saw ${seen}`);
}

async function expectVisible(page, selector, label) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: TIMEOUT });
    record(label, true);
  } catch {
    record(label, false, 'never became visible');
  }
}

async function expectGone(page, selector, label) {
  try {
    await page.locator(selector).first().waitFor({ state: 'detached', timeout: TIMEOUT });
    record(label, true);
  } catch {
    record(label, false, 'still present');
  }
}

/** One connection, taken and released, retried while the app holds the socket. */
async function withDb(fn, attempt = 0) {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      `postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT ?? 5433}/postgres`,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    return await fn(client);
  } catch (error) {
    await client.end().catch(() => {});
    if (attempt > 6) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return withDb(fn, attempt + 1);
  } finally {
    await client.end().catch(() => {});
  }
}

/** The path of the newest link matching `pattern` in the newest email of `kind` to `to`. */
async function latestLinkTo(to, kind, pattern) {
  const html = await withDb(async (client) => {
    const { rows } = await client.query(
      `select html from sent_emails where to_email = $1 and kind = $2
        order by created_at desc limit 1`,
      [to, kind],
    );
    return rows[0]?.html ?? '';
  });
  return html.match(pattern)?.[0] ?? null;
}

/**
 * Remove the smoke admin — identity, profile, roles, invitations and mail — so
 * each run invites a stranger. Run before and after, like the other cleanups.
 */
async function removeSmokeAdmin() {
  return withDb(async (client) => {
    await client.query(`delete from invitations where lower(email) = lower($1)`, [SMOKE_ADMIN]);
    await client.query(`delete from profiles where lower(email) = lower($1)`, [SMOKE_ADMIN]);
    await client.query(`delete from sent_emails where to_email = $1`, [SMOKE_ADMIN]);
    const devAuth = await client.query(`select to_regclass('dev_auth.users') as t`);
    if (devAuth.rows[0].t) {
      await client.query(`delete from dev_auth.users where lower(email) = lower($1)`, [SMOKE_ADMIN]);
    }
  });
}

/**
 * Put REQ-0016 back to `quote_ready` so the accept step is repeatable.
 *
 * The run accepts a quote, which is a real transition with a real event — so
 * without this the second run finds no button and fails on its own leftovers.
 * Scoped to the one demo request rather than re-seeding, so the rest of the
 * database keeps whatever state it had.
 */
async function rewindDemoQuote() {
  return withDb(async (client) => {
    const { rows } = await client.query(`select id from requests where code = 'REQ-0016'`);
    if (!rows[0]) return;
    const id = rows[0].id;
    await client.query(`update requests set status = 'quote_ready' where id = $1`, [id]);
    await client.query(`update quotes set accepted_at = null where request_id = $1`, [id]);
    // request_events is append-only by trigger, so this needs the trigger off —
    // which is exactly the protection working as intended.
    await client.query(`alter table request_events disable trigger request_events_append_only`);
    await client.query(`delete from request_events where request_id = $1 and kind = 'quote_accepted'`, [id]);
    await client.query(`alter table request_events enable trigger request_events_append_only`);
  });
}

/**
 * Put REQ-0019 back mid-change-request, so the resubmission step is repeatable.
 *
 * Same reasoning as the quote: the run answers the change request, which is a
 * real transition, so a second run would otherwise find nothing to resubmit.
 */
async function rewindChangeRequest() {
  return withDb(async (client) => {
    const { rows } = await client.query(`select id from requests where code = 'REQ-0019'`);
    if (!rows[0]) return;
    const id = rows[0].id;
    await client.query(
      `update requests set status = 'changes_requested', package_version = 1 where id = $1`,
      [id],
    );
    await client.query(
      `update line_items set item_status = 'changes_requested', sizing = '36" projection',
              site_notes = null
        where request_id = $1 and item_status = 'pending_review'`,
      [id],
    );
    await client.query(
      `update change_requests set resolved_at = null where request_id = $1`,
      [id],
    );
    await client.query(`alter table request_events disable trigger request_events_append_only`);
    await client.query(
      `delete from request_events where request_id = $1 and kind = 'request_resubmitted'`,
      [id],
    );
    await client.query(`alter table request_events enable trigger request_events_append_only`);
  });
}

/**
 * Remove what this suite submits.
 *
 * The new flows create real requests and a real location, and the assertions
 * above count things ("Cedar Park shows the empty state") — so without this the
 * suite fails on its own leftovers by the second run. Called at both ends: the
 * tail-end call keeps the database tidy, the opening one covers a run that
 * crashed before reaching it.
 */
async function removeSmokeArtifacts(codes = []) {
  return withDb(async (client) => {
    // The lifecycle section marks a request installed, which writes
    // installed_signs — so Oak Plaza would grow a sign per run and the "five
    // installed signs" assertion above would fail. Collected BEFORE the requests
    // go, because source_line_item_id is SET NULL on delete and the trail
    // vanishes with them. (Only inserts: a replacement UPDATES an existing row,
    // and none of the smoke replacements reach `completed`.)
    const { rows: written } = await client.query(
      `select s.id from installed_signs s
         join line_items li on li.id = s.source_line_item_id
         join requests r on r.id = li.request_id
        where r.code = any($1)`,
      [codes],
    );

    await client.query(`alter table request_events disable trigger request_events_append_only`);
    try {
      await client.query(
        `delete from requests
          where code = any($1)
             or location_id in (select id from locations where name = $2)`,
        [codes, SMOKE_LOCATION],
      );
      await client.query(`delete from installed_signs where id = any($1)`, [
        written.map((row) => row.id),
      ]);
      await client.query(`delete from locations where name = $1`, [SMOKE_LOCATION]);
      // §8d: the registration and the welcome email it sent. `sent_emails` goes
      // too — it has no request_id to cascade from, so it would otherwise pile
      // up one row per run in the outbox the team reads.
      await client.query(`delete from franchisee_registrations where email = any($1)`, [
        [SMOKE_REGISTRATION, SMOKE_CORPORATE_REGISTRATION, SMOKE_PEOPLE_REGISTRATION],
      ]);
      // SPEC v2.3: the owner account and company the welcome invitation made.
      await client.query(`delete from invitations where email = any($1)`, [
        [SMOKE_REGISTRATION, SMOKE_CORPORATE_REGISTRATION, SMOKE_PEOPLE_REGISTRATION],
      ]);
      await client.query(`delete from profiles where email = any($1)`, [
        [SMOKE_REGISTRATION, SMOKE_CORPORATE_REGISTRATION, SMOKE_PEOPLE_REGISTRATION],
      ]);
      await client.query(`delete from franchisees where name = 'Smoke Franchise Co'`);
      if ((await client.query(`select to_regclass('dev_auth.users') as t`)).rows[0].t) {
        await client.query(`delete from dev_auth.users where email = any($1)`, [
          [SMOKE_REGISTRATION, SMOKE_CORPORATE_REGISTRATION, SMOKE_PEOPLE_REGISTRATION],
        ]);
      }
      await client.query(`delete from sent_emails where to_email = any($1)`, [
        [SMOKE_REGISTRATION, SMOKE_CORPORATE_REGISTRATION, SMOKE_PEOPLE_REGISTRATION],
      ]);
      // Phase D: the manager this run invites, and Riley's stores and status,
      // which the run changes and puts back.
      await client.query(`delete from invitations where email = $1`, [SMOKE_STAFF]);
      await client.query(`delete from sent_emails where to_email = $1`, [SMOKE_STAFF]);
      await client.query(`delete from profiles where email = $1`, [SMOKE_STAFF]);
      if ((await client.query(`select to_regclass('dev_auth.users') as t`)).rows[0].t) {
        await client.query(`delete from dev_auth.users where email = $1`, [SMOKE_STAFF]);
      }
      await client.query(
        `delete from membership_locations
          where membership_id in (select m.id from memberships m join profiles p on p.id = m.profile_id
                                   where p.email = $1 and m.role = 'franchisee_staff')
            and location_id <> (select id from locations where name = 'Freshbites — Oak Plaza')`,
        [DEV_STAFF.email],
      );
      // Phase C: the reviewer this run invites from the People tab, and the
      // one it deactivates and restores.
      await client.query(`delete from invitations where email = $1`, [SMOKE_CORPORATE_INVITEE]);
      await client.query(`delete from sent_emails where to_email = $1`, [SMOKE_CORPORATE_INVITEE]);
      await client.query(
        `update memberships set active = true, deactivated_at = null
          where profile_id = (select id from profiles where email = $1)`,
        [BRAND_REVIEWER.email],
      );
    } finally {
      await client.query(`alter table request_events enable trigger request_events_append_only`);
    }
  });
}

/**
 * Codes the run submits, so the cleanup can name them exactly.
 *
 * Mirrored to disk as they are captured, because a run that crashes half way
 * takes the in-memory list with it — and the leftovers are not harmless: an
 * abandoned request that reached `completed` has already grown Oak Plaza a
 * sixth installed sign, and the next run fails on an assertion about a state
 * the app put it in correctly. The file is the only way the opening cleanup can
 * know what a previous process created, and naming codes rather than guessing
 * from a range means it can never delete something the suite did not make.
 */
const LEFTOVERS = new URL('./.smoke-leftovers.json', import.meta.url);
const createdCodes = [];
const rememberCodes = () => writeFileSync(LEFTOVERS, JSON.stringify(createdCodes), 'utf8');
const captureCode = async () => {
  createdCodes.push(await page.locator('h1').innerText());
  rememberCodes();
};

/** Whatever a previous run left behind, or nothing if it finished cleanly. */
const abandonedCodes = existsSync(LEFTOVERS)
  ? JSON.parse(readFileSync(LEFTOVERS, 'utf8'))
  : [];

await rewindDemoQuote();
await rewindChangeRequest();
await removeSmokeArtifacts(abandonedCodes);
if (abandonedCodes.length > 0) {
  console.log(`  (cleared ${abandonedCodes.length} request(s) left by a run that did not finish)`);
}
rememberCodes();

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));

// ---------------------------------------------------------------- brand home
// SPEC v2.3 §10.2: "My stores" is behind sign-in. Signed out, the brand page is
// a way in and nothing more — no store, and no request link.
console.log('\nBrand home');
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(page, 'a:text-is("Sign in")', 'signed out, the brand home asks you to sign in');
const signedOutHome = await page.content();
record(
  'and shows no store and no request link',
  !signedOutHome.includes('Oak Plaza') && !/\/request\/[A-Za-z0-9_-]{8,}/.test(signedOutHome),
  'a store or a token appeared on the signed-out page',
);

await expectVisible(page, '#how-it-works', 'it is a landing page: what the program is, before the password');
await page.getByRole('link', { name: 'Sign in', exact: true }).click();
await page.waitForURL('**/sign-in**', { timeout: TIMEOUT });
await page.getByLabel('Email').fill(DEV_FRANCHISEE.email);
await page.getByLabel('Password', { exact: false }).first().fill(DEV_FRANCHISEE.password);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
await expectVisible(page, 'h1:has-text("Dana, your")', 'the franchisee owner signs in to their own stores');
await expectCount(page, 'text=/installed (Sep|Oct) 2025/', 5, 'Oak Plaza shows its five installed signs');
await expectCount(page, 'text=Setup in progress', 1, 'Cedar Park shows the empty state');
await expectCount(page, 'text=/REQ-00(16|17|18)/', 3, 'the three open requests are listed');

// -------------------------------------------------------------- status page
console.log('\nStatus page (REQ-0016, initial setup)');
await page.locator('text=REQ-0016').first().click();
await page.waitForURL('**/request/**', { timeout: TIMEOUT });
await expectVisible(page, 'h1:has-text("REQ-0016")', 'the status page opens from the home card');
await expectVisible(page, 'text=$8,400', 'per-item prices are shown');
await expectCount(page, 'text=Custom quote', 2, 'standin-priced items read as a custom quote');
await expectCount(page, 'text=/TBD: sizing/', 1, 'a TBD field is surfaced without blocking');
await expectVisible(page, 'text=Approved — dining area only.', 'the reviewer’s condition note is shown');
await expectVisible(page, 'text=$12,900', 'the quote total is shown');

// ------------------------------------------------------------ accept a quote
console.log('\nAccepting the quote');

// §10.7 D1: the request link still opens the page for anyone holding it, but
// accepting commits money — a separate browser with only the link cannot.
const linkOnly = await browser.newContext();
const linkOnlyPage = await linkOnly.newPage();
await linkOnlyPage.goto(page.url(), { waitUntil: 'networkidle' });
await expectVisible(linkOnlyPage, 'text=REQ-0016', 'the request link alone still opens the status page');
await expectVisible(linkOnlyPage, 'a:has-text("Sign in to accept")', 'but offers "Sign in to accept" instead of the button');
await expectCount(linkOnlyPage, 'button:has-text("Accept quote")', 0, 'and no accept button');
await linkOnly.close();

const acceptButton = page.getByRole('button', { name: /Accept quote/i });
await expectVisible(page, 'button:has-text("Accept quote")', 'accept-quote is offered on the internal tail');
await acceptButton.click();

await expectVisible(page, 'text=Quote accepted', 'the request moved to accepted');
await expectGone(page, 'button:has-text("Accept quote")', 'the accept button is gone once accepted');
await expectCount(page, 'text=Quote accepted by franchisee', 1, 'the transition wrote a timeline event');
await expectVisible(page, 'h2:has-text("Production")', 'production progress appears');

// ---------------------------------------------- the fast lane, already in flight
console.log('\nThe fast lane (REQ-0017, like-for-like replacement)');
await page.goto(`${BASE}/freshbites/request/demo-oak-plaza-menu-replacement`, {
  waitUntil: 'networkidle',
});
await expectCount(page, 'text=Pre-approved', 1, 'the replacement reads as pre-approved');
await expectCount(page, '[data-testid="readiness"]', 0, 'readiness steps aside once the quote is accepted');
// Scoped to the item card's origin chip: the phrase also appears in the
// timeline summary, which is correct and not what this assertion is about.
await expectCount(
  page,
  'article span:has-text("Like-for-like replacement")',
  1,
  'the item card tags it as a like-for-like replacement',
);
await expectCount(page, 'text=Corporate', 0, 'corporate never appears in its timeline');

// ------------------------------------------------------------- intent picker
console.log('\nIntent picker');
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Request signage/i }).first().click();
await page.waitForURL('**/request', { timeout: TIMEOUT });
await expectVisible(page, 'h1:has-text("What does Oak Plaza need?")', 'the intent picker names the site');
await expectCount(page, 'text=coming in v1.1', 3, 'modify / remove / rebrand are stubbed, not hidden');
await expectVisible(page, 'text=Pre-approved — straight to quote', 'the fast lane states its rule up front');

// -------------------------------------------------- like-for-like submission
console.log('\nSubmitting a like-for-like replacement');
await page.getByRole('link', { name: /Replace like-for-like/i }).click();
await page.waitForURL('**/replace', { timeout: TIMEOUT });
await page.getByRole('button', { name: /Freshbites Storefront Letters/ }).click();
await page.getByRole('button', { name: 'Faded / worn', exact: true }).click();
await expectVisible(page, 'text=Ready to submit — pre-approved', 'the pre-approval is stated before submitting');
await page
  .locator('input[type=file]')
  .setInputFiles({ name: 'condition.png', mimeType: 'image/png', buffer: PIXEL_PNG });
await expectVisible(page, 'text=condition.png', 'the condition photo uploads');
await page.getByRole('button', { name: /Submit replacement request/ }).click();
await page.waitForURL('**/freshbites/request/**', { timeout: TIMEOUT });
await captureCode();
await expectCount(page, 'text=Pre-approved', 1, 'the new item auto-approved — no corporate step');
await expectVisible(page, 'text=Condition photo', 'the uploaded photo is attached to the item');
await expectVisible(
  page,
  'text=/Like-for-like replacement: Freshbites Storefront Letters/',
  'the submission wrote its timeline event',
);

// ------------------------------------------------------------- adding a sign
console.log('\nAdding a sign to an existing location');
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Request signage/i }).first().click();
await page.getByRole('link', { name: /Add a new sign/i }).click();
await page.waitForURL('**/add', { timeout: TIMEOUT });
await page.getByRole('button', { name: /Add · needs approval/ }).first().click();
await page.locator('input[placeholder="Sizing / site notes"]').first().fill('48" back wall');
await page.getByRole('button', { name: /Submit .*for approval/ }).click();
await page.waitForURL('**/freshbites/request/**', { timeout: TIMEOUT });
await captureCode();
// Scoped to the item card's chip: the same words appear in the timeline
// summary, which is correct and not what this assertion is about.
await expectCount(
  page,
  'article span:has-text("Needs corporate approval")',
  1,
  'an add-on goes to corporate',
);
await expectVisible(page, 'text=/needs corporate approval/', 'the timeline says why');

// ------------------------------------------------------------- initial setup
console.log('\nInitial setup (new location)');
await page.goto(`${BASE}/freshbites/setup`, { waitUntil: 'networkidle' });
await page.getByLabel('Location name').fill(SMOKE_LOCATION);
await page.getByLabel('Street address').fill('1 Smoke Test Way');
await page.getByLabel('City').fill('Austin');
await page.getByLabel('State').fill('TX');
await page.getByLabel('ZIP').fill('78704');
await page.getByLabel('Your name').fill('Dana Whitfield');
await page.getByRole('button', { name: /Freestanding/ }).click();
await page.getByRole('button', { name: /Yes — a lender is involved/ }).click();
await page.getByRole('button', { name: /Load my sign package/ }).click();
await expectVisible(page, 'h1:has-text("requires these 5 signs")', 'the freestanding package loads five signs');
await page.locator('input[placeholder="Sizing / site notes"]').first().fill("24' frontage");
await page.getByRole('button', { name: /This standard sign won/ }).click();
await page.locator('textarea').first().fill('Landlord prohibits illuminated signage');
await page.getByRole('button', { name: /Flag for corporate review/ }).click();
await expectVisible(page, 'text=/corporate will review this item/', 'a flagged standard sign becomes an exception');
await page.getByRole('button', { name: /Continue ·/ }).click();
await page.getByRole('button', { name: /No add-ons needed|Continue →/ }).click();
await expectVisible(page, 'h2:has-text("Going to corporate for approval (1)")', 'review splits the package by approval path');
await page.getByRole('button', { name: /Submit location request/ }).click();
await page.waitForURL('**/freshbites/request/**', { timeout: TIMEOUT });
await expectCount(
  page,
  'article span:has-text("Exception")',
  1,
  'the exception item carries its origin',
);
await expectVisible(page, 'text=Landlord prohibits illuminated signage', 'the issue text reaches the status page');
await expectVisible(page, 'text=/Initial setup submitted \\(4 standard \\+ 1 needing review\\)/', 'the submission event counts the split');
await expectVisible(page, 'text=/lender is funding this location/', 'the §8b financing answer is carried through');

// Package readiness: the request's own facts, read in one place. A new store's
// first request gets every row; the item needing review is waiting on
// corporate, not something the franchisee must chase.
await expectVisible(page, '[data-testid="readiness"]', 'the status page shows package readiness');
await expectCount(page, '[data-testid="readiness"] li', 5, 'a new store is asked about all five things');
await expectCount(
  page,
  '[data-testid="readiness"] li[data-state="with_corporate"]:has-text("Approved signs")',
  1,
  'the item needing review reads as with corporate',
);

// -------------------------------------------------------- change-request loop
console.log('\nAnswering a change request (REQ-0019)');
await page.goto(`${BASE}/freshbites/request/demo-oak-plaza-changes-requested`, {
  waitUntil: 'networkidle',
});
await expectVisible(page, 'h2:has-text("Update this item and resubmit")', 'only the flagged item is editable');
await expectCount(
  page,
  '[data-testid="readiness"] li[data-state="follow_up"]:has-text("Approved signs")',
  1,
  'readiness flags the item sent back for changes',
);
await expectCount(
  page,
  'article span:text-is("Approved")',
  1,
  'the sibling item keeps its approval',
);
await page.locator('input[placeholder="Sizing / site notes"]').first().fill('30" projection');
await page.locator('textarea').first().fill('Landlord confirmed 30" is within the lease exhibit.');
await page.getByRole('button', { name: /Resubmit for review/ }).click();
await expectVisible(page, 'text=/package v2/', 'resubmitting bumps the package version');
await expectGone(page, 'h2:has-text("Update this item and resubmit")', 'the change request is closed');
await expectVisible(page, 'text=Resubmitted with changes', 'the resubmission wrote its event');

// ------------------------------------------------------- the operator console
// /admin is the Signage.com team's real screen (Session 3), and the reviewer
// acts from the approval email — read here through /admin/outbox, which is the
// record of everything the system sent. Together they close the loop, and this
// section is what proves it: submit -> prep -> corporate -> route -> price ->
// deliver -> accept -> install -> the location record grows.
console.log('\nThe operator console (/admin) and the approval email');

// SPEC v2.3 §10.3.3: a password, then a code from an authenticator. The dev
// provider is a real password login, so each half can be refused on its own.
// Still signed in as the franchisee from the sections above: the console is
// not theirs, and says so rather than looping.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=/which has no access to that page/', 'a franchisee account cannot open the console');
await page.getByRole('button', { name: 'Sign out' }).click();
await page.waitForURL('**/sign-in**', { timeout: TIMEOUT });

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await expectVisible(page, 'h1:text-is("Sign in to Signage.com")', '/admin sends anyone not signed in to Signage.com’s sign-in');

await page.getByLabel('Email').fill(DEV_ADMIN.email);
await page.getByLabel('Password', { exact: false }).first().fill('not-the-password');
await page.getByRole('button', { name: 'Sign in' }).click();
await expectVisible(page, "text=/That email and password don't match/", 'a wrong password is refused');

await page.getByLabel('Password', { exact: false }).first().fill(DEV_ADMIN.password);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/two-factor**', { timeout: TIMEOUT });
await expectVisible(page, 'h1:text-is("Enter your code")', 'the right password asks for the second factor');

// The password alone is not a Signage.com session: the console still refuses.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
record(
  'and the console stays shut until it is passed',
  page.url().includes('/two-factor'),
  `landed on ${page.url().replace(BASE, '')}`,
);

await page.getByLabel('Six-digit code').fill('000000');
await page.getByRole('button', { name: 'Continue' }).click();
await expectVisible(page, "text=/That code didn't match/", 'a wrong code is refused');
await page.getByLabel('Six-digit code').fill(totpCode(DEV_ADMIN.totpSecret));
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForURL(/\/admin$/, { timeout: TIMEOUT });
await expectVisible(page, 'h1:has-text("Request queue")', 'the right code reaches the queue');
await expectVisible(page, 'text=fast lane', 'fast-lane requests are badged in the queue');

await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Request signage/i }).first().click();
await page.getByRole('link', { name: /Add a new sign/i }).click();
await page.waitForURL('**/add', { timeout: TIMEOUT });
// The pylon overrides to an approved vendor and is standin-priced, so one
// request exercises the package split AND manual pricing.
for (const name of ['Freshbites Road Sign', 'Freshbites Neon Leaf']) {
  await page.locator(`div:has(> p:text-is("${name}")) >> button:has-text("Add · needs approval")`).first().click();
}
await page.getByRole('button', { name: /Submit .*for approval/ }).click();
await page.waitForURL('**/freshbites/request/**', { timeout: TIMEOUT });
await captureCode();
const lifecycleCode = createdCodes.at(-1);
const lifecycleId = await withDb(async (client) =>
  (await client.query('select id from requests where code = $1', [lifecycleCode])).rows[0].id,
);
const admin = `${BASE}/admin/request/${lifecycleId}`;

await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Prepare package' }).click();
await expectVisible(page, 'text=Package prepared · 0 auto-approved, 2 sent for review', 'package prep derives the request to corporate');
await expectVisible(page, 'text=Landlord sign criteria reviewed: not provided', 'the §8b landlord check is logged either way');

// The approval email — and the link inside it, which is the reviewer's whole
// credential. Read out of the outbox exactly as a reviewer reads their inbox.
const approvalEmail = await withDb(async (client) =>
  (
    await client.query(
      `select id from sent_emails where request_id = $1 and kind = 'review_requested'
        order by created_at desc limit 1`,
      [lifecycleId],
    )
  ).rows[0],
);
record('preparing the package sent the approval email', Boolean(approvalEmail));

await page.goto(`${BASE}/admin/outbox/${approvalEmail.id}`, { waitUntil: 'networkidle' });
const emailFrame = page.frameLocator('iframe');
const approveHref = await emailFrame.locator('a:has-text("Approve")').first().getAttribute('href');
record('the email carries a per-item approval link', /\/review\/.+item=/.test(approveHref ?? ''));

// Opening the link must decide nothing: corporate mail scanners follow links.
await page.goto(approveHref, { waitUntil: 'networkidle' });
const statusAfterOpening = await withDb(async (client) =>
  (await client.query('select status from requests where id = $1', [lifecycleId])).rows[0].status,
);
record('opening the link decides nothing', statusAfterOpening === 'needs_review');
await expectVisible(page, 'text=/already proceeding|need a decision|Approve this sign/', 'the link opens the review page');

// Send one item back — the note is required.
await page.locator('button:has-text("Request changes")').first().click();
const blocked = await page.locator('button:has-text("Send back with this note")').first().isDisabled();
record('request-changes is blocked without a note', blocked);
await page.locator('textarea').first().fill('Confirm the pole height with the city.');
await page.locator('button:has-text("Send back with this note")').first().click();
await expectVisible(page, 'text=/Sent back to the franchisee/', 'the reviewer can send one item back');

await page.goto(admin, { waitUntil: 'networkidle' });
await expectGone(page, 'button:has-text("Route for quote")', 'a request with an item out for changes cannot be routed');

// The franchisee answers; that mints a NEW link and kills the old email's.
const lifecycleToken = await withDb(async (client) =>
  (await client.query('select access_token from requests where id = $1', [lifecycleId])).rows[0]
    .access_token,
);
await page.goto(`${BASE}/freshbites/request/${lifecycleToken}`, { waitUntil: 'networkidle' });
await page.locator('input[placeholder="Sizing / site notes"]').first().fill('18ft pole');
await page.getByRole('button', { name: /Resubmit for review/ }).click();
await expectVisible(page, 'text=/package v2/', 'the franchisee answers the change request');

await page.goto(approveHref, { waitUntil: 'networkidle' });
await expectVisible(page, 'h1:has-text("That link was replaced")', 'the superseded link stops working');

const reReview = await withDb(async (client) =>
  (
    await client.query(
      `select id, subject from sent_emails where request_id = $1 and kind = 'review_requested_again'
        order by created_at desc limit 1`,
      [lifecycleId],
    )
  ).rows[0],
);
record('resubmission sent the re-review email', Boolean(reReview));

// SPEC v2.3 §10.7 D4: the approval email goes to the brand's reviewer
// ACCOUNTS once it has any, not to the address configured at setup.
const reReviewTo = await withDb(async (client) =>
  (await client.query('select to_email from sent_emails where id = $1', [reReview.id])).rows[0]
    .to_email,
);
record('the approval email goes to the brand’s reviewer accounts', reReviewTo === BRAND_REVIEWER.email, reReviewTo);

await page.goto(`${BASE}/admin/outbox/${reReview.id}`, { waitUntil: 'networkidle' });
const freshHrefs = await page
  .frameLocator('iframe')
  .locator('a:has-text("Approve")')
  .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
const freshHref = freshHrefs[0];

// §9b phase C's demo: a reviewer approves from the dashboard, and the same
// item's email button then says it is already decided — by whom, and how.
const corporate = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const corporatePage = await corporate.newPage();
corporatePage.on('pageerror', (error) => pageErrors.push(error.message));
await signInWithPassword(corporatePage, BRAND_REVIEWER, null);
await corporatePage.waitForURL(/\/freshbites\/corporate$/, { timeout: TIMEOUT });
record('a reviewer signs in and lands on the dashboard', true);

await corporatePage.goto(`${BASE}/freshbites/corporate?tab=approvals`, { waitUntil: 'networkidle' });
const onDashboard = corporatePage.locator(`section[data-request-code="${lifecycleCode}"]`);
await onDashboard.getByRole('button', { name: 'Approve this sign' }).first().click();
await expectVisible(corporatePage, 'text=/approved\./', 'the reviewer approves one item from the dashboard');

const sessionDecision = await withDb(async (client) =>
  (
    await client.query(
      `select li.id, li.reviewed_route, li.reviewed_by_email, li.reviewed_via_token,
              (select e.detail->>'via' from request_events e
                where e.line_item_id = li.id and e.kind = 'item_approved'
                order by e.created_at desc limit 1) as event_via
         from line_items li
        where li.request_id = $1 and li.item_status = 'approved'`,
      [lifecycleId],
    )
  ).rows[0],
);
record(
  'recorded against the reviewer, by session, with no link',
  sessionDecision?.reviewed_route === 'session' &&
    sessionDecision?.reviewed_by_email === BRAND_REVIEWER.email &&
    sessionDecision?.reviewed_via_token === null &&
    sessionDecision?.event_via === 'session',
  JSON.stringify(sessionDecision),
);

const sameItemHref = freshHrefs.find((href) => href?.includes(`item=${sessionDecision?.id}`));
await page.goto(sameItemHref, { waitUntil: 'networkidle' });
await expectVisible(
  page,
  'text=/was already approved by Jordan Reyes from the dashboard/',
  'the same item’s email button then says it is already decided',
);

// The other item, from the link — the same decision code, the other route.
await page.getByRole('button', { name: 'Approve this sign' }).first().click();
await expectVisible(page, 'text=Every item on this request has been decided', 'both items end up decided');
const linkVia = await withDb(async (client) =>
  (
    await client.query(
      `select reviewed_route from line_items
        where request_id = $1 and id <> $2 and item_status = 'approved'`,
      [lifecycleId, sessionDecision?.id],
    )
  ).rows[0]?.reviewed_route,
);
record('and the one decided from the email is recorded as the link', linkVia === 'link', linkVia);

// Single-use: once the review is complete the link retires itself.
await page.goto(freshHref, { waitUntil: 'networkidle' });
await expectVisible(page, 'h1:has-text("This review is complete")', 'the link retires once the review is done');

await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Route for quote' }).click();
// The pylon's per-item override disagrees with the brand policy, so ONE request
// becomes TWO packages (SPEC §4) — the case the Freshbites seed exists to prove.
await expectCount(
  page,
  'section:has(h2:text-is("Next step")) [data-recipient]',
  2,
  'routing splits the request into two vendor packages, each with its own chain',
);

// The split is only worth anything if the two packages reach two COMPANIES
// (docs/DECISIONS.md #20). Before per-policy contacts existed, both of these
// resolved to the brand's single vendor address and this passed anyway.
const vendorEmails = await withDb(async (client) =>
  (
    await client.query(
      `select to_email, cc_email, subject, html from sent_emails
        where request_id = $1 and kind = 'vendor_package' order by created_at`,
      [lifecycleId],
    )
  ).rows,
);
record('each package was emailed to its own vendor', vendorEmails.length === 2);
record(
  'the two packages went to two different addresses',
  new Set(vendorEmails.map((mail) => mail.to_email)).size === 2,
  vendorEmails.map((mail) => mail.to_email).join(' / '),
);
record(
  'the pylon package went to the approved vendor, not the brand default',
  vendorEmails.some((mail) => mail.to_email === 'quotes@meridiansign.example'),
);
record(
  'corporate is copied on the routed packages',
  vendorEmails.every((mail) => mail.cc_email === 'brand@freshbites.com'),
);
// A vendor is not a party to either credential in this system, and a forwarded
// package must not hand a fabricator the franchisee's workspace.
const accessToken = await withDb(async (client) =>
  (await client.query('select access_token from requests where id = $1', [lifecycleId])).rows[0]
    .access_token,
);
record(
  'no vendor package leaks the franchisee token or a reviewer link',
  vendorEmails.every(
    (mail) => !mail.html.includes(accessToken) && !mail.html.includes('/review/'),
  ),
);
record(
  'each package lists only its own items',
  vendorEmails.some((mail) => mail.html.includes('Freshbites Road Sign')) &&
    vendorEmails.every(
      (mail) =>
        !(
          mail.html.includes('Freshbites Road Sign') && mail.html.includes('Freshbites Neon Leaf')
        ),
    ),
);

await expectVisible(page, 'text=/need manual pricing/', 'standin items raise the manual-pricing banner');
await page.locator('input[placeholder="e.g. 2400"]').first().fill('7400');
await page.getByRole('button', { name: 'Set price' }).first().click();
await expectVisible(page, 'text=/priced manually/', 'a standin item is priced by hand');

// A team-uploaded mockup — the whole mockup story until Session 7.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator('input[type=file]').first().setInputFiles({ name: 'mockup.png', mimeType: 'image/png', buffer: PIXEL_PNG });
await expectVisible(page, 'text=/Mockup attached to/', 'the team can attach a mockup per item');

// The §4 split, run BOTH tails at once (SPEC §6, amended v2.2).
//
// This request holds the pylon, which the brand overrides to its approved
// vendor, and the Neon Leaf, which does not — so routing produced two packages
// with two recipients and two lifecycles. Until v2.2 the request carried a
// single fulfillment status, so the franchisee was offered no accept button at
// all and Signage.com's half could never be invoiced (DECISIONS #51, #57). What
// follows is that whole storyline, and it is the reason the spec changed.
const ourCard = '[data-recipient="Signage.com Manufacturing"]';
const theirCard = '[data-recipient="Meridian Sign Co."]';
const requestStatus = async () =>
  withDb(async (client) =>
    (await client.query('select status from requests where id = $1', [lifecycleId])).rows[0].status,
  );
const packageStages = async () =>
  withDb(async (client) =>
    (
      await client.query(
        `select recipient_name, delivered_at, accepted_at, in_production_at, shipped_at, completed_at
           from quotes where request_id = $1 order by external`,
        [lifecycleId],
      )
    ).rows,
  );

// The vendor quotes off-platform; the team logs it against THEIR package.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(`${theirCard} input[placeholder="Vendor total"]`).fill('9000');
await page.locator(theirCard).getByRole('button', { name: 'Log vendor quote' }).click();
await expectVisible(page, 'text=/Vendor quote logged/', 'the external tail logs what the vendor quoted');

// One package quoted is not a quoted request: the rollup waits for the slowest.
record(
  'one package quoted does not move the request — the rollup waits',
  (await requestStatus()) === 'sent_for_quote',
  await requestStatus(),
);

// Now Signage.com delivers its own.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(ourCard).getByRole('button', { name: 'Deliver quote to franchisee' }).click();
await expectVisible(page, 'text=/Quote delivered to franchisee/', 'Signage.com delivers its own package');
record(
  'with both quoted, the request rolls up to quote_ready',
  (await requestStatus()) === 'quote_ready',
  await requestStatus(),
);

// The franchisee's page. Before v2.2 this offered nothing at all.
await page.goto(`${BASE}/freshbites/request/${accessToken}`, { waitUntil: 'networkidle' });
await expectCount(
  page,
  `${ourCard} button:has-text("Accept quote")`,
  1,
  'the franchisee CAN accept the Signage.com half of a split request',
);
await expectCount(
  page,
  `${theirCard} button:has-text("Accept quote")`,
  0,
  'and cannot accept the vendor half, which is ordered with them directly',
);
await expectVisible(
  page,
  'text=/ordering happens with them directly|order this part with/',
  'the vendor card says who to order with instead',
);

await page.locator(ourCard).getByRole('button', { name: /Accept quote/i }).click();
await expectVisible(page, 'text=Quote accepted', 'accepting moves that package');
record(
  'accepting one half leaves the REQUEST at quote_ready — the vendor half is untouched',
  (await requestStatus()) === 'quote_ready',
  await requestStatus(),
);
const afterAccept = await packageStages();
record(
  'and exactly one package is accepted',
  afterAccept.filter((row) => row.accepted_at !== null).length === 1,
  afterAccept.map((r) => `${r.recipient_name}:${r.accepted_at ? 'accepted' : 'open'}`).join(' · '),
);

// DECISIONS #57, closed: the invoice gate is the PACKAGE's acceptance, so
// Signage.com can bill its own half while the vendor's is still open.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Issue invoice' }).first().click();
await expectVisible(
  page,
  'text=/INV-\\d{4}/',
  'Signage.com can invoice its half of a split request (DECISIONS #57)',
);

// The vendor's order comes in, and only now is the whole site committed.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(theirCard).getByRole('button', { name: 'Log order placed' }).click();
await expectVisible(page, 'text=/Order logged/', 'the external order is logged, not accepted in-app');
record(
  'with both packages committed, the request rolls up to accepted',
  (await requestStatus()) === 'accepted',
  await requestStatus(),
);

// Signage.com fabricates and installs its half while the vendor is still out.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(ourCard).getByRole('button', { name: 'Start production' }).click();
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(ourCard).getByRole('button', { name: 'Mark shipped' }).click();
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(ourCard).getByRole('button', { name: 'Mark installed' }).click();
await expectVisible(page, 'text=/Installed — location record updated/', 'Signage.com installs its half');
record(
  'the request is NOT complete — the vendor half is still out',
  (await requestStatus()) === 'accepted',
  await requestStatus(),
);

// The writeback is scoped to the package: our sign is on the record, theirs is
// not, because theirs is not on the building.
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=Freshbites Neon Leaf', 'our installed sign is on the location record');
await expectCount(
  page,
  'text=Freshbites Road Sign',
  0,
  'and the vendor’s is not — it has not been installed yet',
);

// The vendor finally reports in.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator(theirCard).getByRole('button', { name: 'Mark installed' }).click();
// Wait for the write, not for the click: the status below is read straight
// from SQL, which does not auto-wait the way a locator assertion does. Waiting
// on the button to GO rather than on text — `text=Installed` matches the
// "Mark installed" button itself, so it was satisfied before the click landed.
await expectGone(
  page,
  `${theirCard} button:has-text("Mark installed")`,
  'the vendor package has no milestone left to log',
);
record(
  'the last package completes the request',
  (await requestStatus()) === 'completed',
  await requestStatus(),
);

// The point of the whole system: the location record grew.
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=Freshbites Road Sign', 'the new sign is on the location record');

// ------------------------------------ the internal tail, and the notification set
console.log('\nThe internal tail (Signage.com fulfills) and the franchisee notifications');

/** The latest message of one kind for one request, read as the franchisee reads their inbox. */
const franchiseeMail = async (requestId, kind) =>
  withDb(async (client) =>
    (
      await client.query(
        `select id, to_email, subject, html from sent_emails
          where request_id = $1 and kind = $2 order by created_at desc limit 1`,
        [requestId, kind],
      )
    ).rows[0],
  );

// The Neon Leaf is the only add-on with NO vendor override, so a request holding
// just it resolves to exactly one INTERNAL package — the tail the lifecycle
// above never reaches, and the only one that delivers a quote in-portal.
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Request signage/i }).first().click();
await page.getByRole('link', { name: /Add a new sign/i }).click();
await page.waitForURL('**/add', { timeout: TIMEOUT });
await page
  .locator('div:has(> p:text-is("Freshbites Neon Leaf")) >> button:has-text("Add · needs approval")')
  .first()
  .click();
await page.getByRole('button', { name: /Submit .*for approval/ }).click();
await page.waitForURL('**/freshbites/request/**', { timeout: TIMEOUT });
await captureCode();
const internalCode = createdCodes.at(-1);
const internalId = await withDb(async (client) =>
  (await client.query('select id from requests where code = $1', [internalCode])).rows[0].id,
);
const internalAdmin = `${BASE}/admin/request/${internalId}`;

// `add` never asks who the franchisee is — only initial setup does — so the
// contact is carried forward from the location's most recent request. Without
// that there is no recipient and every notification below silently does nothing,
// which is exactly how it failed: the flow still passed, the mail never went.
const submittedMail = await franchiseeMail(internalId, 'franchisee_submitted');
record('the submission is confirmed to the franchisee by email', Boolean(submittedMail));
record(
  'an `add` request carries the requester forward from the location',
  submittedMail?.to_email === 'dana@freshbites-austin.com',
  submittedMail?.to_email ?? 'no recipient — the notification set is dead',
);

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Prepare package' }).click();
// Wait for the transition to land before reading the outbox — the click returns
// to the browser before the server action has finished writing.
await expectVisible(page, 'text=/Package prepared/', 'the single add-on is sent to corporate');
const internalReview = await withDb(async (client) =>
  (
    await client.query(
      `select id from sent_emails where request_id = $1 and kind = 'review_requested'
        order by created_at desc limit 1`,
      [internalId],
    )
  ).rows[0],
);
await page.goto(`${BASE}/admin/outbox/${internalReview.id}`, { waitUntil: 'networkidle' });
const internalApprove = await page
  .frameLocator('iframe')
  .locator('a:has-text("Approve")')
  .first()
  .getAttribute('href');
await page.goto(internalApprove, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Approve this sign' }).first().click();
await expectVisible(
  page,
  'text=/Every item on this request has been decided|already proceeding/',
  'the single add-on is approved',
);
// One email per review, not per item (docs/DECISIONS.md): a reviewer decides a
// package in one sitting, and one message per sign is worse than one message.
record(
  'the decision reaches the franchisee as a single email',
  Boolean(await franchiseeMail(internalId, 'franchisee_review_decided')),
);

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Route for quote' }).click();
// The button is the routing having finished, so it gates the SQL read below.
await expectVisible(
  page,
  'button:has-text("Deliver quote to franchisee")',
  'the internal tail offers the quote in-portal, not a vendor log',
);
const internalPackages = await withDb(async (client) =>
  (await client.query('select external from quotes where request_id = $1', [internalId])).rows,
);
record(
  'a request with no vendor override routes to one internal package',
  internalPackages.length === 1 && internalPackages[0].external === false,
);

await page.getByRole('button', { name: 'Deliver quote to franchisee' }).click();
await expectVisible(page, 'text=/With the franchisee/', 'the delivered quote waits on the franchisee');
const quoteReadyMail = await franchiseeMail(internalId, 'franchisee_quote_ready');
record('delivering the quote emails the franchisee', Boolean(quoteReadyMail));
record(
  'the quote email carries the franchisee’s own workspace link',
  quoteReadyMail?.html.includes('/freshbites/request/') ?? false,
);

const internalToken = await withDb(async (client) =>
  (await client.query('select access_token from requests where id = $1', [internalId])).rows[0]
    .access_token,
);
await page.goto(`${BASE}/freshbites/request/${internalToken}`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Accept quote/i }).click();
await expectVisible(page, 'text=Quote accepted', 'the franchisee accepts the quote it just received');
record(
  'accepting the quote is confirmed by email',
  Boolean(await franchiseeMail(internalId, 'franchisee_quote_accepted')),
);

// ------------------------------------------ the §8b invoice and paid receipt
// Acceptance is the trigger SPEC §8b names for the invoice, so this belongs
// here, between accepting and production, rather than in a section of its own.
await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Issue invoice' }).click();
await expectVisible(page, 'text=/INV-\\d{4}/', 'the team issues an invoice once the quote is accepted');

const invoiceNumber = await withDb(async (client) =>
  (await client.query('select invoice_number from quotes where request_id = $1', [internalId]))
    .rows[0].invoice_number,
);
// Assigned once and never regenerated: a lender files the document by its
// number, so a second issue must be refused rather than mint a second number.
await page.goto(internalAdmin, { waitUntil: 'networkidle' });
record(
  'the invoice number is issued once, not on every visit',
  (await page.getByRole('button', { name: 'Issue invoice' }).count()) === 0,
);

const [invoicePdf] = await Promise.all([
  page.waitForEvent('download', { timeout: TIMEOUT }),
  page.locator('a:has-text("Invoice PDF")').click(),
]);
record(
  'the invoice downloads as a real PDF named for its number',
  invoicePdf.suggestedFilename() === `${invoiceNumber.toLowerCase()}.pdf`,
  invoicePdf.suggestedFilename(),
);

// The receipt does not exist until a payment is recorded — "marked PAID with
// date and method" (SPEC §8b) needs a date and a method to exist first.
const internalTokenUrl = `${BASE}/freshbites/request/${internalToken}`;
const earlyReceipt = await fetch(
  `${BASE}/api/documents/invoice/${internalToken}/${await withDb(async (client) =>
    (await client.query('select id from quotes where request_id = $1', [internalId])).rows[0].id,
  )}?kind=receipt`,
  { redirect: 'manual' },
);
record(
  'no receipt exists before a payment is recorded',
  earlyReceipt.status === 404,
  `status ${earlyReceipt.status}`,
);

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.locator('input[placeholder="How it was paid (ACH, check…)"]').fill('ACH');
await page.locator('input[placeholder="Reference (optional)"]').fill('SMOKE-PAY-1');
await page.getByRole('button', { name: 'Record payment' }).click();
await expectVisible(page, 'text=PAID', 'recording a payment marks the invoice paid');

const [receiptPdf] = await Promise.all([
  page.waitForEvent('download', { timeout: TIMEOUT }),
  page.locator('a:has-text("Receipt PDF")').click(),
]);
record(
  'the receipt downloads as a real PDF',
  receiptPdf.suggestedFilename() === `${invoiceNumber.toLowerCase()}-receipt.pdf`,
  receiptPdf.suggestedFilename(),
);

// The whole point of §8b: the franchisee is the one who hands these to a
// lender, so they must be reachable from their own link without asking anyone.
await page.goto(internalTokenUrl, { waitUntil: 'networkidle' });
await expectVisible(
  page,
  `a:has-text("Invoice ${invoiceNumber}")`,
  'the franchisee can download the invoice from their own status page',
);
await expectVisible(
  page,
  'a:has-text("Paid receipt")',
  'and the paid receipt alongside it',
);

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start production' }).click();
await expectVisible(page, 'button:has-text("Mark shipped")', 'production starts on the internal tail');
// Deliberately silent (docs/DECISIONS.md): the accept email already told them
// production had started, and saying it twice is how a sender gets filtered.
const productionMailCount = await withDb(async (client) =>
  (
    await client.query(
      `select count(*)::int as n from sent_emails
        where request_id = $1 and kind = 'franchisee_in_production'`,
      [internalId],
    )
  ).rows[0].n,
);
record('starting production sends nothing — the accept email already said so', productionMailCount === 0);

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Mark shipped' }).click();
await expectVisible(page, 'button:has-text("Mark installed")', 'the internal tail ships');
record('shipping emails the franchisee', Boolean(await franchiseeMail(internalId, 'franchisee_shipped')));

await page.goto(internalAdmin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Mark installed' }).click();
await expectVisible(page, 'text=/Installed — location record updated/', 'the internal tail completes');
record('the install notice reaches the franchisee', Boolean(await franchiseeMail(internalId, 'franchisee_installed')));

// The set as a whole. Six of the seven belong to this request; the seventh —
// changes_requested — fires on the lifecycle request above, the only one that
// sends an item back. Asserted together so a template that stops firing is a
// failure here rather than a silence nobody notices.
const franchiseeMails = await withDb(async (client) =>
  (
    await client.query(
      `select kind, to_email, html from sent_emails
        where request_id = any($1) and kind like 'franchisee_%'`,
      [[internalId, lifecycleId]],
    )
  ).rows,
);
const EXPECTED_NOTIFICATIONS = [
  'franchisee_submitted',
  'franchisee_changes_requested',
  'franchisee_review_decided',
  'franchisee_quote_ready',
  'franchisee_quote_accepted',
  'franchisee_shipped',
  'franchisee_installed',
];
const sentKinds = new Set(franchiseeMails.map((mail) => mail.kind));
const missing = EXPECTED_NOTIFICATIONS.filter((kind) => !sentKinds.has(kind));
record('all seven franchisee notifications fired', missing.length === 0, missing.join(', ') || 'none missing');
record(
  'every franchisee email is addressed to the person who filled the form',
  franchiseeMails.every((mail) => mail.to_email === 'dana@freshbites-austin.com'),
);
// The franchisee holds one credential and corporate holds another; a status
// update must never hand the franchisee the reviewer's.
record(
  'no franchisee email carries a reviewer link',
  franchiseeMails.every((mail) => !mail.html.includes('/review/')),
);

// ------------------------------------------------ the §8b budget one-pager
console.log('\nThe budget one-pager (SPEC §8b)');

// Gated before anything else: the sheet carries a brand's whole standard-package
// price list, and the export lives on an authenticated surface for that reason.
const anonymousPdf = await fetch(`${BASE}/api/documents/budget/freshbites/endcap`, {
  redirect: 'manual',
});
record(
  'the budget sheet is not downloadable without signing in',
  anonymousPdf.status === 404,
  `status ${anonymousPdf.status}`,
);

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
const documents = page.locator('section:has(h2:text-is("Brand documents"))');
await documents.waitFor({ timeout: TIMEOUT }).catch(() => {});
// One link per format that actually HAS a package — a brand with no
// freestanding package has no freestanding number, and the panel must not
// offer a link that can only 404.
await expectCount(
  page,
  'section:has(h2:text-is("Brand documents")) a',
  3,
  'the queue offers a budget sheet per format with a package',
);

// Downloaded through the browser, as an operator does it — the route builds the
// PDF on demand, so a template that throws shows up here and nowhere else.
const [budgetDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: TIMEOUT }),
  documents.locator('a:has-text("Endcap budget PDF")').click(),
]);
const budgetBytes = await budgetDownload.createReadStream().then(async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
});
record(
  'the endcap sheet downloads as a real PDF',
  budgetBytes.subarray(0, 5).toString() === '%PDF-' && budgetBytes.length > 1000,
  `${budgetDownload.suggestedFilename()} · ${budgetBytes.length} bytes`,
);

// ------------------------------------------------- the §8b budgetary quote
console.log('\nThe budgetary quote (SPEC §8b)');

// The inverse gate to the one-pager: the token IS the credential here, because
// the franchisee is the one filling in the loan application. So the check that
// matters is that a token nobody holds opens nothing.
const strangerPdf = await fetch(`${BASE}/api/documents/quote/not-a-real-token`, {
  redirect: 'manual',
});
record(
  'an unknown token gets no budgetary quote',
  strangerPdf.status === 404,
  `status ${strangerPdf.status}`,
);

// A submitted-but-unquoted request has no number yet, and a $0 lender document
// is the failure this refusal exists to prevent. Read from SQL rather than
// named, so it stays true whichever request the suite happened to leave there.
const unquotedToken = await withDb(async (client) =>
  (
    await client.query(
      `select r.access_token from requests r
        where not exists (select 1 from quotes q where q.request_id = r.id)
        limit 1`,
    )
  ).rows[0]?.access_token,
);
if (unquotedToken) {
  const unquotedPdf = await fetch(`${BASE}/api/documents/quote/${unquotedToken}`, {
    redirect: 'manual',
  });
  record(
    'a request with no quote is refused rather than given a $0 document',
    unquotedPdf.status === 404,
    `status ${unquotedPdf.status}`,
  );
  await page.goto(`${BASE}/freshbites/request/${unquotedToken}`, { waitUntil: 'networkidle' });
  await expectCount(
    page,
    'section:has(h2:text-is("Documents"))',
    0,
    'and the status page offers no download either',
  );
}

// REQ-0016 is the seeded initial setup: five items, two of them standin-priced,
// quoted at $12,900. The document must agree with the quote card above it —
// same number, same page — because a franchisee forwards one and reads the other.
await page.goto(`${BASE}/freshbites/request/demo-cedar-park-initial-setup`, {
  waitUntil: 'networkidle',
});
await expectVisible(
  page,
  'section:has(h2:text-is("Documents"))',
  'the status page offers the budgetary quote once the quote is priced',
);

// Downloaded through the browser as the franchisee does it: the PDF is built on
// demand, so a template that throws on real data fails here and nowhere else.
const [quoteDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: TIMEOUT }),
  page.locator('a:has-text("Budgetary quote")').click(),
]);
const quoteBytes = await quoteDownload.createReadStream().then(async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
});
record(
  'the budgetary quote downloads as a real PDF',
  quoteBytes.subarray(0, 5).toString() === '%PDF-' && quoteBytes.length > 1000,
  `${quoteDownload.suggestedFilename()} · ${quoteBytes.length} bytes`,
);
record(
  'it is named for the request, which is what a lender files it under',
  quoteDownload.suggestedFilename() === 'req-0016-budgetary-quote.pdf',
  quoteDownload.suggestedFilename(),
);

// ---------------------------------------- the §8d welcome email and level 1
console.log('\nThe welcome email and level-1 access (SPEC §8d)');

// Registration IS the trigger: there is no separate send step, and the check
// that matters is that one form submission produces a real message.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
const registrations = page.locator('section:has(h2:text-is("Franchisee registrations"))');
await registrations.locator('input[type="email"]').fill(SMOKE_REGISTRATION);
await registrations.locator('input[type="text"]').fill('Dana Whitfield');
await registrations.getByRole('button', { name: /Register/i }).click();
await expectVisible(
  page,
  `section:has(h2:text-is("Franchisee registrations")) >> text=${SMOKE_REGISTRATION}`,
  'registering a franchisee records them on the queue',
);
await expectVisible(
  page,
  'section:has(h2:text-is("Franchisee registrations")) >> text=welcomed',
  'and the welcome email went out on that one action',
);

const registration = await withDb(async (client) =>
  (
    await client.query(
      `select id, access_token, welcome_sent_at from franchisee_registrations where email = $1`,
      [SMOKE_REGISTRATION],
    )
  ).rows[0],
);
const welcomeMail = await withDb(async (client) =>
  (
    await client.query(
      `select to_email, subject, html, request_id from sent_emails
        where to_email = $1 and kind = 'welcome' order by created_at desc limit 1`,
      [SMOKE_REGISTRATION],
    )
  ).rows[0],
);

record(
  'the welcome email is addressed to the registered franchisee',
  welcomeMail?.to_email === SMOKE_REGISTRATION,
  welcomeMail?.to_email ?? 'nothing was sent',
);
// The only message in the build with no request behind it — at agreement
// signing there is no location, no lease and nothing to attach it to.
record(
  'it belongs to no request, because none exists at signing',
  welcomeMail?.request_id === null,
  String(welcomeMail?.request_id),
);
const welcomeLink = `${BASE}/freshbites/welcome/${registration?.access_token}`;
record(
  'it carries the registration link, which is their only way in',
  (welcomeMail?.html ?? '').includes(welcomeLink),
  registration?.access_token ? `token ${registration.access_token.slice(0, 8)}…` : 'no token',
);
// The seeded inline package: 8,400 + 2,900, with frosting and the entrance sign
// quoted per site. The number in the email has to be the number in the PDF.
record(
  'the signage number in it is the one the budget sheet totals',
  (welcomeMail?.html ?? '').includes('$11,300'),
  '$11,300 inline',
);
// SPEC §8d: ordering stays invisible at this stage, and the DID (§8c, Session 8)
// has no destination yet — a dead link here is the worst one in the build.
const welcomeProse = (welcomeMail?.html ?? '').replace(/<[^>]*>/g, ' ').toLowerCase();
record(
  'it says nothing about ordering signs, which is months away',
  !welcomeProse.includes('order') && !welcomeProse.includes('request signage'),
  'ordering invisible',
);
// SPEC v2.3 §10.3.1: the owner invitation leads, their page follows, and the
// DID is still described rather than linked.
const welcomeHrefs = [...(welcomeMail?.html ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
record(
  'and it links to the account invitation, then their own page, and nowhere else',
  welcomeHrefs.length === 2 && /\/invite\/[A-Za-z0-9_-]+$/.test(welcomeHrefs[0]) && welcomeHrefs[1] === welcomeLink,
  welcomeHrefs.join(' , '),
);
const firstInvite = welcomeHrefs[0]?.replace(BASE, '') ?? null;

// The landing page itself, opened exactly as the franchisee opens it.
await page.goto(welcomeLink, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=Your signage budget', 'the link opens their level-1 page');
await expectCount(
  page,
  'section:has(h2:text-is("Your signage budget")) a[href^="/api/documents/welcome/"]',
  3,
  'with a budget sheet per format the brand has a package for',
);
// Not a disabled button: at this stage there is nothing to order, and a control
// that cannot work teaches a franchisee that half the product is noise.
await expectCount(page, 'a[href*="/request"]', 0, 'and no way to order signs, which is the point');

const [welcomePdf] = await Promise.all([
  page.waitForEvent('download', { timeout: TIMEOUT }),
  page.locator('a[href^="/api/documents/welcome/"]').first().click(),
]);
const welcomeBytes = await welcomePdf.createReadStream().then(async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
});
record(
  'the budget sheet downloads on their token, with no team login',
  welcomeBytes.subarray(0, 5).toString() === '%PDF-' && welcomeBytes.length > 1000,
  `${welcomePdf.suggestedFilename()} · ${welcomeBytes.length} bytes`,
);

// The token is the credential, so the check that matters is that a token nobody
// holds opens nothing — the page and the document alike.
const strangerWelcome = await fetch(`${BASE}/freshbites/welcome/not-a-real-token`, {
  redirect: 'manual',
});
record(
  'an unknown token opens no level-1 page',
  strangerWelcome.status === 404,
  `status ${strangerWelcome.status}`,
);
const strangerSheet = await fetch(`${BASE}/api/documents/welcome/not-a-real-token/inline`, {
  redirect: 'manual',
});
record(
  'and no budget sheet either',
  strangerSheet.status === 404,
  `status ${strangerSheet.status}`,
);

// Re-sending is the realistic support case ("they never got it"), and it must
// NOT mint a new token — the franchisee who finds the first email later still
// has to get in.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await registrations.getByRole('button', { name: /Resend welcome/i }).first().click();
await page.waitForTimeout(500);
const afterResend = await withDb(async (client) =>
  (
    await client.query(
      `select access_token,
              (select count(*) from sent_emails where to_email = $1 and kind = 'welcome') as sent
         from franchisee_registrations where email = $1`,
      [SMOKE_REGISTRATION],
    )
  ).rows[0],
);
record(
  're-sending the welcome keeps the link that is already in their inbox',
  afterResend?.access_token === registration?.access_token && Number(afterResend?.sent) === 2,
  `${afterResend?.sent} sent, token unchanged`,
);

// SPEC v2.3 §10.3.2 and §10.7 D7: the invitation in the welcome email is the
// sign-up. A franchisee with no lease yet lands on the level-1 view of their
// own (empty) store list — the number for the business plan, and "Set up a
// store" for later — and sees none of anyone else's stores.
const newestInvite = await latestLinkTo(SMOKE_REGISTRATION, 'welcome', /\/invite\/[A-Za-z0-9_-]+/);
const franchisee = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const franchiseePage = await franchisee.newPage();
franchiseePage.on('pageerror', (error) => pageErrors.push(error.message));

await franchiseePage.goto(`${BASE}${firstInvite}`, { waitUntil: 'networkidle' });
await expectVisible(franchiseePage, 'h1:text-is("Invitation withdrawn")', 're-sending the welcome retires the older invitation');

await franchiseePage.goto(`${BASE}${newestInvite}`, { waitUntil: 'networkidle' });
await expectVisible(franchiseePage, 'text=Franchisee owner', 'the newest invitation opens owner sign-up');
await franchiseePage.getByLabel('Your name').fill('Smoke Owner');
await franchiseePage.getByLabel('Company name').fill('Smoke Franchise Co');
await franchiseePage.getByLabel('Choose a password').fill('smoke-owner-password-1');
await franchiseePage.getByLabel('Confirm password').fill('smoke-owner-password-1');
await franchiseePage.getByRole('button', { name: 'Create my account' }).click();
await expectVisible(franchiseePage, 'text=/whether your lease is signed/', 'sign-up asks whether the lease is signed');
await franchiseePage.getByText('Not yet', { exact: true }).click();
await franchiseePage.getByRole('button', { name: 'Create my account' }).click();
await franchiseePage.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
await expectVisible(
  franchiseePage,
  'text=The signage number for your business plan',
  'with no lease, sign-up lands on the level-1 view: the budget number',
);
await expectVisible(franchiseePage, 'text=Lease signed? Set up your first store', 'and "set up a store" for later');
record(
  "and none of another franchisee's stores",
  !(await franchiseePage.content()).includes('Oak Plaza'),
  'Oak Plaza belongs to Freshbites Austin',
);
await franchisee.close();

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await expectVisible(
  page,
  `section:has(h2:text-is("Franchisee registrations")) li:has-text("${SMOKE_REGISTRATION}") >> text=account created`,
  "the team's registration list shows the account was created",
);

// --------------------------------------------- the corporate dashboard (§9.6)
// Behind sign-in since SPEC v2.3 phase C. The checks are about who reaches it,
// what each corporate role may do there, and that the retired dashboard links
// open nothing at all.

const dashboardSignedOut = await fetch(`${BASE}/freshbites/corporate`, { redirect: 'manual' });
record(
  'the dashboard sends a signed-out visitor to sign in',
  dashboardSignedOut.status >= 300 &&
    dashboardSignedOut.status < 400 &&
    (dashboardSignedOut.headers.get('location') ?? '').includes('/sign-in'),
  `status ${dashboardSignedOut.status}`,
);

// Retired links: every one was revoked by the migration, and the old address
// says what changed instead of opening anything.
const liveCorporateLinks = await withDb(async (client) =>
  Number(
    (await client.query(`select count(*) as n from corporate_links where revoked_at is null`)).rows[0]
      .n,
  ),
);
record('no dashboard link is live any more', liveCorporateLinks === 0, `${liveCorporateLinks} live`);
await corporatePage.goto(`${BASE}/freshbites/corporate/not-a-real-token`, { waitUntil: 'networkidle' });
await expectVisible(
  corporatePage,
  'h1:text-is("Dashboard links have been replaced")',
  'an old dashboard link says it was replaced by sign-in',
);
await expectCount(corporatePage, 'text=Brand control across all locations', 0, 'and shows none of the program');

// A franchisee has no corporate role: the dashboard does not exist for them.
const danaContext = await browser.newContext();
const danaPage = await danaContext.newPage();
await signInWithPassword(danaPage, DEV_FRANCHISEE, '/freshbites');
await danaPage.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
const danaDashboard = await danaPage.goto(`${BASE}/freshbites/corporate`, { waitUntil: 'networkidle' });
record("a franchisee cannot open the brand's dashboard", danaDashboard?.status() === 404, `status ${danaDashboard?.status()}`);
await danaContext.close();

// The reviewer, still signed in from the approval above.
await corporatePage.goto(`${BASE}/freshbites/corporate`, { waitUntil: 'networkidle' });
await expectVisible(corporatePage, 'text=Brand control across all locations', 'the reviewer reads the program');

// The metrics are the franchisor's whole read of the program, so they are
// checked against the database rather than against themselves.
const portfolio = await withDb(async (client) =>
  (
    await client.query(
      `select
         (select count(*) from locations where brand_id = b.id) as locations,
         (select count(*) from installed_signs s join locations l on l.id = s.location_id
           where l.brand_id = b.id) as installed,
         (select count(*) from requests where brand_id = b.id and status <> 'completed') as open,
         (select count(*) from line_items li join requests r on r.id = li.request_id
           where r.brand_id = b.id and li.item_status = 'pending_review') as pending
       from brands b where b.slug = 'freshbites'`,
    )
  ).rows[0],
);
const tiles = await corporatePage.locator('main .grid > div').allInnerTexts();
const tileFor = (label) => tiles.find((text) => text.includes(label))?.split('\n')[0];
record(
  'the metrics row counts what the database holds',
  tileFor('Locations') === String(portfolio.locations) &&
    tileFor('Installed signs') === String(portfolio.installed) &&
    tileFor('Open requests') === String(portfolio.open) &&
    tileFor('Awaiting approval') === String(portfolio.pending),
  `${portfolio.locations} loc · ${portfolio.installed} signs · ${portfolio.open} open · ${portfolio.pending} pending`,
);
// Per PACKAGE, not per request (SPEC §6 as amended): a split request has one
// accepted half and one still open, and the request-level number is either
// double or nothing.
const committed = await withDb(async (client) =>
  (
    await client.query(
      `select coalesce(sum(q.priced_total), 0) as total from quotes q
         join requests r on r.id = q.request_id
        where r.brand_id = (select id from brands where slug = 'freshbites')
          and q.accepted_at is not null`,
    )
  ).rows[0].total,
);
const committedLabel = `$${Math.round(Number(committed)).toLocaleString('en-US')}`;
record(
  'program spend is the accepted packages, priced per package',
  tileFor('Program spend') === committedLabel,
  `${tileFor('Program spend')} vs ${committedLabel}`,
);

// §10.2: a reviewer reads, decides and exports — and does not manage people or
// register franchisees.
await expectCount(corporatePage, 'nav a:text-is("People")', 0, 'a reviewer has no People tab');
await expectCount(
  corporatePage,
  'section:has(h2:text-is("Franchisee registrations"))',
  0,
  'and no franchisee registration panel',
);

const [corporatePdf] = await Promise.all([
  corporatePage.waitForEvent('download', { timeout: TIMEOUT }),
  corporatePage.locator('a[href^="/api/documents/budget/"]').first().click(),
]);
const corporateBytes = await corporatePdf.createReadStream().then(async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
});
record(
  'the budget sheet downloads for a signed-in reviewer',
  corporateBytes.subarray(0, 5).toString() === '%PDF-' && corporateBytes.length > 1000,
  `${corporatePdf.suggestedFilename()} · ${corporateBytes.length} bytes`,
);
const anonymousSheet = await fetch(`${BASE}/api/documents/budget/freshbites/inline`, {
  redirect: 'manual',
});
record('and not for anyone signed out', anonymousSheet.status === 404, `status ${anonymousSheet.status}`);

// The approvals tab lists every item waiting on corporate, and decides.
await corporatePage.getByRole('link', { name: /^Approvals/ }).click();
await corporatePage.waitForLoadState('networkidle');
await expectCount(
  corporatePage,
  'main article',
  Number(portfolio.pending),
  'the approvals tab lists every item waiting on corporate',
);

// Sending the email again: to the brand's reviewer accounts (§10.7 D4).
const beforeResend = await withDb(async (client) =>
  Number(
    (await client.query(`select count(*) as n from sent_emails where kind = 'review_requested'`))
      .rows[0].n,
  ),
);
if (Number(portfolio.pending) > 0) {
  await corporatePage
    .getByRole('button', { name: /Send the approval email again/i })
    .first()
    .click();
  await expectVisible(
    corporatePage,
    'text=The new message replaces the previous link',
    'it can re-send the approval email',
  );
  const afterResendApproval = await withDb(async (client) =>
    (
      await client.query(
        `select count(*) as n,
                (select to_email from sent_emails where kind = 'review_requested'
                  order by created_at desc limit 1) as recipient
           from sent_emails where kind = 'review_requested'`,
      )
    ).rows[0],
  );
  record(
    'which goes to the brand’s reviewers and nobody else',
    Number(afterResendApproval.n) === beforeResend + 1 &&
      afterResendApproval.recipient === BRAND_REVIEWER.email,
    `${afterResendApproval.n} sent, last to ${afterResendApproval.recipient}`,
  );
}
await corporate.close();

// The brand admin: everything the reviewer has (§10.7 D3), plus registering
// franchisees and managing the brand's people.
const brandAdmin = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const adminPage = await brandAdmin.newPage();
adminPage.on('pageerror', (error) => pageErrors.push(error.message));
await signInWithPassword(adminPage, BRAND_ADMIN, '/freshbites/corporate');
await adminPage.waitForURL(/\/freshbites\/corporate$/, { timeout: TIMEOUT });

const corporateRegistrations = adminPage.locator('section:has(h2:text-is("Franchisee registrations"))');
await corporateRegistrations.locator('input[type="email"]').fill(SMOKE_CORPORATE_REGISTRATION);
await corporateRegistrations.getByRole('button', { name: /Register/i }).click();
await expectVisible(
  adminPage,
  `section:has(h2:text-is("Franchisee registrations")) >> text=${SMOKE_CORPORATE_REGISTRATION}`,
  'a brand admin can register a franchisee',
);
const corporateRow = await withDb(async (client) =>
  (
    await client.query(
      `select registered_by,
              (select count(*) from sent_emails where to_email = $1 and kind = 'welcome') as sent
         from franchisee_registrations where email = $1`,
      [SMOKE_CORPORATE_REGISTRATION],
    )
  ).rows[0],
);
// The record says who actually typed it (DECISIONS #61).
record(
  'and the record says corporate did it, not the team',
  corporateRow?.registered_by === 'corporate' && Number(corporateRow?.sent) === 1,
  `${corporateRow?.registered_by} · ${corporateRow?.sent} welcome sent`,
);

await adminPage.getByRole('link', { name: 'People' }).click();
await adminPage.waitForLoadState('networkidle');
await expectVisible(adminPage, `[data-person="${BRAND_REVIEWER.email}"]`, 'People lists the brand’s reviewer');
await adminPage.locator('#invite-email').fill(SMOKE_CORPORATE_INVITEE);
await adminPage.locator('#invite-role').selectOption('brand_reviewer');
await adminPage.getByRole('button', { name: 'Send invitation' }).click();
await expectVisible(adminPage, `text=Invitation sent to ${SMOKE_CORPORATE_INVITEE}`, 'a brand admin invites a reviewer');
const corporateInvite = await withDb(async (client) =>
  (
    await client.query(
      `select i.role, i.brand_id = (select id from brands where slug = 'freshbites') as on_brand,
              m.role as inviter_role
         from invitations i left join memberships m on m.id = i.invited_by
        where i.email = $1 order by i.created_at desc limit 1`,
      [SMOKE_CORPORATE_INVITEE],
    )
  ).rows[0],
);
record(
  'the invitation is for that role on that brand, from the brand admin',
  corporateInvite?.role === 'brand_reviewer' &&
    corporateInvite?.on_brand === true &&
    corporateInvite?.inviter_role === 'brand_admin',
  JSON.stringify(corporateInvite),
);

// Deactivation takes effect on the reviewer's next click.
const reviewerAgain = await browser.newContext();
const reviewerPage = await reviewerAgain.newPage();
await signInWithPassword(reviewerPage, BRAND_REVIEWER, '/freshbites/corporate');
await reviewerPage.waitForURL(/\/freshbites\/corporate$/, { timeout: TIMEOUT });

adminPage.once('dialog', (dialog) => dialog.accept());
await adminPage
  .locator(`[data-person="${BRAND_REVIEWER.email}"]`)
  .getByRole('button', { name: 'Deactivate' })
  .click();
await expectVisible(
  adminPage,
  `[data-person="${BRAND_REVIEWER.email}"] >> text=deactivated`,
  'a brand admin deactivates a reviewer',
);
const lockedOut = await reviewerPage.goto(`${BASE}/freshbites/corporate`, { waitUntil: 'networkidle' });
record('who is locked out on their next click', lockedOut?.status() === 404, `status ${lockedOut?.status()}`);

await adminPage
  .locator(`[data-person="${BRAND_REVIEWER.email}"]`)
  .getByRole('button', { name: 'Reactivate' })
  .click();
await expectGone(adminPage, `[data-person="${BRAND_REVIEWER.email}"] >> text=deactivated`, 'and reactivates them');
const backIn = await reviewerPage.goto(`${BASE}/freshbites/corporate`, { waitUntil: 'networkidle' });
record('who is back in on the next click', backIn?.status() === 200, `status ${backIn?.status()}`);
await reviewerAgain.close();
await brandAdmin.close();

// ------------------------------------------------ store staff (§9b phase D)
// As its demo reads: a manager sees one store of two. Then the owner's side —
// invite a manager to named stores, change a manager's stores, deactivate one —
// each taking effect on the staff member's next click.

const storeIds = await withDb(async (client) =>
  Object.fromEntries(
    (
      await client.query(
        `select name, id from locations where name = any($1)`,
        [['Freshbites — Oak Plaza', 'Freshbites — Cedar Park']],
      )
    ).rows.map((row) => [row.name, row.id]),
  ),
);
const oakPlaza = storeIds['Freshbites — Oak Plaza'];
const cedarPark = storeIds['Freshbites — Cedar Park'];

const staffContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const staffPage = await staffContext.newPage();
staffPage.on('pageerror', (error) => pageErrors.push(error.message));
await signInWithPassword(staffPage, DEV_STAFF, null);
await staffPage.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
await expectVisible(staffPage, 'h2:text-is("Freshbites — Oak Plaza")', 'a store manager sees the store they are assigned');
await expectCount(staffPage, 'h2:text-is("Freshbites — Cedar Park")', 0, 'and not the other store of the two');
await expectCount(staffPage, 'text=Set up a new store', 0, 'staff cannot set up a store');
await expectCount(staffPage, 'text=Store staff', 0, 'or manage staff');
const staffOther = await staffPage.goto(`${BASE}/freshbites/location/${cedarPark}/request`, {
  waitUntil: 'networkidle',
});
record('the other store’s ordering page is a 404 for them', staffOther?.status() === 404, `status ${staffOther?.status()}`);
const staffOwn = await staffPage.goto(`${BASE}/freshbites/location/${oakPlaza}/request`, {
  waitUntil: 'networkidle',
});
record('their own store’s is open', staffOwn?.status() === 200, `status ${staffOwn?.status()}`);
const staffStaffPage = await staffPage.goto(`${BASE}/freshbites/staff`, { waitUntil: 'networkidle' });
record('and the staff page is not theirs', staffStaffPage?.status() === 404, `status ${staffStaffPage?.status()}`);

// The owner.
const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const ownerPage = await ownerContext.newPage();
ownerPage.on('pageerror', (error) => pageErrors.push(error.message));
await signInWithPassword(ownerPage, DEV_FRANCHISEE, null);
await ownerPage.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
await ownerPage.getByRole('link', { name: /Store staff/ }).click();
await ownerPage.waitForURL(/\/freshbites\/staff$/, { timeout: TIMEOUT });
await expectVisible(ownerPage, `[data-staff="${DEV_STAFF.email}"]`, 'the owner sees their staff');

// Give Riley both stores; the next click shows both.
await ownerPage
  .locator(`[data-staff="${DEV_STAFF.email}"] label:has-text("Freshbites — Cedar Park") input`)
  .check();
await ownerPage.locator(`[data-staff="${DEV_STAFF.email}"]`).getByRole('button', { name: 'Save stores' }).click();
await expectGone(ownerPage, `[data-staff="${DEV_STAFF.email}"] button:has-text("Save stores")`, 'the owner changes a manager’s stores');
await staffPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(staffPage, 'h2:text-is("Freshbites — Cedar Park")', 'and the manager sees the new store on their next click');

// And back.
await ownerPage
  .locator(`[data-staff="${DEV_STAFF.email}"] label:has-text("Freshbites — Cedar Park") input`)
  .uncheck();
await ownerPage.locator(`[data-staff="${DEV_STAFF.email}"]`).getByRole('button', { name: 'Save stores' }).click();
await expectGone(ownerPage, `[data-staff="${DEV_STAFF.email}"] button:has-text("Save stores")`, 'taking a store away saves too');
await staffPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectCount(staffPage, 'h2:text-is("Freshbites — Cedar Park")', 0, 'and it is gone on their next click');

// Invite a second manager, to Cedar Park only.
await ownerPage.locator('#staff-email').fill(SMOKE_STAFF);
await ownerPage.locator('form label:has-text("Freshbites — Cedar Park") input').check();
await ownerPage.getByRole('button', { name: 'Send invitation' }).click();
await expectVisible(ownerPage, `text=Invitation sent to ${SMOKE_STAFF}`, 'the owner invites a manager to one store');
const staffInvite = await withDb(async (client) =>
  (
    await client.query(
      `select i.role, i.location_ids::text[] as stores,
              i.franchisee_id = (select franchisee_id from locations where id = $2) as own_company
         from invitations i where i.email = $1 order by i.created_at desc limit 1`,
      [SMOKE_STAFF, cedarPark],
    )
  ).rows[0],
);
record(
  'the invitation is staff, at their company, for that store',
  staffInvite?.role === 'franchisee_staff' &&
    staffInvite?.own_company === true &&
    staffInvite?.stores?.length === 1 &&
    staffInvite?.stores?.[0] === cedarPark,
  JSON.stringify(staffInvite),
);

const staffInviteLink = await latestLinkTo(SMOKE_STAFF, 'invitation', /\/invite\/[A-Za-z0-9_-]+/);
const newStaff = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const newStaffPage = await newStaff.newPage();
newStaffPage.on('pageerror', (error) => pageErrors.push(error.message));
await newStaffPage.goto(`${BASE}${staffInviteLink}`, { waitUntil: 'networkidle' });
await expectVisible(newStaffPage, 'text=Store staff', 'the invitation opens staff sign-up');
await newStaffPage.getByLabel('Your name').fill('Smoke Manager');
await newStaffPage.getByLabel('Choose a password').fill('smoke-staff-password-1');
await newStaffPage.getByLabel('Confirm password').fill('smoke-staff-password-1');
await newStaffPage.getByRole('button', { name: 'Create my account' }).click();
await newStaffPage.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
await expectVisible(newStaffPage, 'h2:text-is("Freshbites — Cedar Park")', 'the new manager lands on their one store');
await expectCount(newStaffPage, 'h2:text-is("Freshbites — Oak Plaza")', 0, 'and only that one');

// Deactivated: nothing on the next click.
await ownerPage.reload({ waitUntil: 'networkidle' });
ownerPage.once('dialog', (dialog) => dialog.accept());
await ownerPage.locator(`[data-staff="${SMOKE_STAFF}"]`).getByRole('button', { name: 'Deactivate' }).click();
await expectVisible(ownerPage, `[data-staff="${SMOKE_STAFF}"] >> text=deactivated`, 'the owner deactivates a manager');
await newStaffPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectCount(newStaffPage, 'h2:text-is("Freshbites — Cedar Park")', 0, 'who sees no store on their next click');

await newStaff.close();

// ------------------------------- franchisee people, from corporate (#140)
// A brand admin reaches every franchisee company in the brand: its owners and
// its staff, with the owner's own staff screen. Each change lands on the
// person's next click, as it does from the owner's side.
const corpPeople = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const corpPage = await corpPeople.newPage();
corpPage.on('pageerror', (error) => pageErrors.push(error.message));
await signInWithPassword(corpPage, BRAND_ADMIN, '/freshbites/corporate?tab=people');
await corpPage.waitForURL(/\/freshbites\/corporate\?tab=people$/, { timeout: TIMEOUT });
const austin = corpPage.locator('[data-franchisee="Freshbites Austin"]');
await expectVisible(corpPage, '[data-franchisee="Freshbites Austin"]', 'a brand admin sees the franchisee companies');
await austin.getByRole('button', { name: /Freshbites Austin/ }).click();
await expectVisible(corpPage, `[data-owner="${DEV_FRANCHISEE.email}"]`, 'with each company’s owner');
await expectVisible(corpPage, `[data-staff="${DEV_STAFF.email}"]`, 'and its store staff');

// Registering from here is the §8d registration itself, written as corporate's.
const peopleRegistrations = corpPage.locator('[data-registrations="people"]');
await peopleRegistrations.locator('input[type="email"]').fill(SMOKE_PEOPLE_REGISTRATION);
await peopleRegistrations.getByRole('button', { name: /Register/i }).click();
await expectVisible(
  corpPage,
  `[data-registrations="people"] >> text=${SMOKE_PEOPLE_REGISTRATION}`,
  'a brand admin registers a franchisee from the People tab',
);
const peopleRegistration = await withDb(async (client) =>
  (
    await client.query(
      `select r.registered_by, i.role as invite_role,
              exists (select 1 from sent_emails e where e.to_email = r.email) as emailed
         from franchisee_registrations r left join invitations i on i.email = r.email
        where r.email = $1`,
      [SMOKE_PEOPLE_REGISTRATION],
    )
  ).rows[0],
);
record(
  'as corporate, with an owner invitation, and the welcome email sent',
  peopleRegistration?.registered_by === 'corporate' &&
    peopleRegistration?.invite_role === 'franchisee_owner' &&
    peopleRegistration?.emailed === true,
  JSON.stringify(peopleRegistration),
);

// Staff stores, from corporate.
await austin.locator(`[data-staff="${DEV_STAFF.email}"] label:has-text("Freshbites — Cedar Park") input`).check();
await austin.locator(`[data-staff="${DEV_STAFF.email}"]`).getByRole('button', { name: 'Save stores' }).click();
await expectGone(corpPage, `[data-staff="${DEV_STAFF.email}"] button:has-text("Save stores")`, 'the brand admin changes a manager’s stores');
await staffPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(staffPage, 'h2:text-is("Freshbites — Cedar Park")', 'and the manager sees it on their next click');
await austin.locator(`[data-staff="${DEV_STAFF.email}"] label:has-text("Freshbites — Cedar Park") input`).uncheck();
await austin.locator(`[data-staff="${DEV_STAFF.email}"]`).getByRole('button', { name: 'Save stores' }).click();
await expectGone(corpPage, `[data-staff="${DEV_STAFF.email}"] button:has-text("Save stores")`, 'and puts it back');

// The owner, deactivated and back.
corpPage.once('dialog', (dialog) => dialog.accept());
await austin.locator(`[data-owner="${DEV_FRANCHISEE.email}"]`).getByRole('button', { name: 'Deactivate' }).click();
await expectVisible(corpPage, `[data-owner="${DEV_FRANCHISEE.email}"] >> text=deactivated`, 'the brand admin deactivates a franchisee owner');
await ownerPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectCount(ownerPage, 'h2:text-is("Freshbites — Oak Plaza")', 0, 'who sees no store on their next click');
await austin.locator(`[data-owner="${DEV_FRANCHISEE.email}"]`).getByRole('button', { name: 'Reactivate' }).click();
await expectGone(corpPage, `[data-owner="${DEV_FRANCHISEE.email}"] >> text=deactivated`, 'and reactivates them');
await ownerPage.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(ownerPage, 'h2:text-is("Freshbites — Oak Plaza")', 'who is back on the next click');
await corpPeople.close();

await ownerContext.close();
await staffContext.close();

// ------------------------------------------------ the landing page at /
// Signed out, `/` asks where to sign in: Signage.com's own sign-in, or a
// brand's, on that brand's portal. Each role picks its brand and lands on its
// own view there; a signed-in visit to `/` goes straight to the account's home.
{
  const LANDING_PORTAL = BASE.replace('://localhost', '://freshbites.localhost');
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const chooser = await context.newPage();
  chooser.on('pageerror', (error) => pageErrors.push(error.message));
  await chooser.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await expectVisible(chooser, 'h2:text-is("Where do you sign in?")', 'signed out, / asks where to sign in');
  await expectCount(chooser, 'input[type="password"]', 0, 'and holds no sign-in form of its own');
  await expectCount(chooser, `a[href="${LANDING_PORTAL}/sign-in"]`, 1, 'Freshbites is offered on its own portal');
  await chooser.locator('a[href="/sign-in"]').click();
  await expectVisible(chooser, 'h1:text-is("Sign in to Signage.com")', 'the Signage.com choice is Signage.com’s own sign-in');
  await chooser.goto(`${BASE}/sign-in?next=${encodeURIComponent('/freshbites/request/x')}`, { waitUntil: 'networkidle' });
  await expectVisible(chooser, 'h1:text-is("Sign in to Freshbites signage")', 'a sign-in headed for a brand page wears that brand');
  await context.close();
}
for (const [who, account, landing] of [
  ['a franchisee', DEV_FRANCHISEE, /freshbites\.localhost:\d+\/freshbites$/],
  ['a brand admin', BRAND_ADMIN, /freshbites\.localhost:\d+\/freshbites\/corporate$/],
  ['store staff', DEV_STAFF, /freshbites\.localhost:\d+\/freshbites$/],
]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const landingPage = await context.newPage();
  landingPage.on('pageerror', (error) => pageErrors.push(error.message));
  await landingPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await landingPage.locator('a[href$="/sign-in"]').filter({ hasText: 'Freshbites' }).click();
  await landingPage.waitForURL(/freshbites\.localhost:\d+\/sign-in/, { timeout: TIMEOUT });
  await landingPage.getByLabel('Email').fill(account.email);
  await landingPage.getByLabel('Password').fill(account.password);
  await landingPage.getByRole('button', { name: 'Sign in' }).click();
  await landingPage.waitForURL(landing, { timeout: TIMEOUT }).catch(() => {});
  record(`choosing Freshbites at / lands ${who} on their own view, on the portal`, landing.test(landingPage.url()), landingPage.url());
  await context.close();
}
{
  // Signed in on the main address, `/` is not a chooser: it is the way home.
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const home = await context.newPage();
  home.on('pageerror', (error) => pageErrors.push(error.message));
  await signInWithPassword(home, DEV_FRANCHISEE);
  await home.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
  await home.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  record('and / sends a signed-in franchisee to their stores', /\/freshbites$/.test(home.url()), home.url());
  await context.close();
}

// ------------------------------------------- brand portals (§9b phase D)
// `{brand}.signage.com`, which in development is `freshbites.localhost` — the
// browser resolves it to this machine with no DNS. It serves the brand's pages
// at its root, keeps the path-based ones working, wears the brand on sign-in,
// has a session of its own, and does not serve the console.
const PORTAL = BASE.replace('://localhost', '://freshbites.localhost');
const portal = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const portalPage = await portal.newPage();
portalPage.on('pageerror', (error) => pageErrors.push(error.message));

await portalPage.goto(`${PORTAL}/`, { waitUntil: 'networkidle' });
await expectVisible(portalPage, 'text=Order and track signage for your Freshbites stores', 'freshbites.localhost serves the brand at its root');
await portalPage.goto(`${PORTAL}/sign-in`, { waitUntil: 'networkidle' });
await expectVisible(portalPage, 'h1:text-is("Sign in to Freshbites signage")', 'its sign-in wears the brand');
await portalPage.getByLabel('Email').fill(BRAND_ADMIN.email);
await portalPage.getByLabel('Password', { exact: false }).first().fill(BRAND_ADMIN.password);
await portalPage.getByRole('button', { name: 'Sign in' }).click();
await portalPage.waitForURL(/freshbites\.localhost:\d+\/freshbites\/corporate$/, { timeout: TIMEOUT });
record('and signing in there stays on the portal', true, portalPage.url());

await portalPage.goto(`${PORTAL}/corporate`, { waitUntil: 'networkidle' });
await expectVisible(portalPage, 'text=Brand control across all locations', 'the short path /corporate is the dashboard');
const portalAdmin = await portalPage.goto(`${PORTAL}/admin`, { waitUntil: 'networkidle' });
record('the console is not served on a brand address', portalAdmin?.status() === 404, `status ${portalAdmin?.status()}`);
const portalOther = await portalPage.goto(`${PORTAL}/otherbrand`, { waitUntil: 'networkidle' });
record('nor another brand', portalOther?.status() === 404, `status ${portalOther?.status()}`);

// The session belongs to the portal's address: the same browser is signed out
// on the plain one.
const plainDashboard = await portalPage.goto(`${BASE}/freshbites/corporate`, { waitUntil: 'networkidle' });
record(
  'and the portal session does not carry to another address',
  portalPage.url().includes('/sign-in') && plainDashboard?.status() === 200,
  portalPage.url(),
);
await portal.close();

// Only the proxy may say a request is on a portal.
const spoofed = await fetch(`${BASE}/sign-in`, { headers: { 'x-brand-portal': 'freshbites' } });
record(
  'a client cannot claim to be on a portal',
  !(await spoofed.text()).includes('Sign in to Freshbites signage'),
);

// ------------------------------------------------------------ dead-link copy
// Every 404 in this build means the same thing — a token did not resolve — and
// nobody typed the URL, so "check the address" is useless advice. The page has
// to say what actually happened. Asserted alongside the status because the two
// come apart easily: a `loading.tsx` on the segment makes the response stream,
// and a streamed notFound() answers 200 (DECISIONS #79).
const deadLink = await fetch(`${BASE}/freshbites/request/not-a-real-token`, {
  redirect: 'manual',
});
const deadBody = await deadLink.text();
record(
  'a dead link answers 404 and explains itself',
  deadLink.status === 404 && deadBody.includes('That link did not open anything'),
  `status ${deadLink.status}`,
);

// ------------------------------------------------------------- the outbox
// It renders whole emails, and those emails carry live credentials: a
// reviewer's signed approval link, a franchisee's status token, a corporate
// dashboard link. It sat behind an environment flag until Session 6c; the
// check that matters is that it is now behind the allowlist instead.
const outboxSignedOut = await fetch(`${BASE}/admin/outbox`, { redirect: 'manual' });
const outboxBody = outboxSignedOut.status < 300 ? await outboxSignedOut.text() : '';
record(
  'the outbox is not readable without signing in',
  outboxSignedOut.status >= 300 || !outboxBody.includes('Sent messages'),
  `status ${outboxSignedOut.status}`,
);
// Signed in, it is a working support tool — reached from the console chrome
// rather than by knowing a URL.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'Outbox' }).click();
await page.waitForLoadState('networkidle');
await expectVisible(page, 'h1:text-is("Sent messages")', 'and is one click from the queue when you are');

// -------------------------------------------------------- the entry points
// The same bargain as the outbox, and the same check. This page lists live
// franchisee tokens and welcome links in one place, which is only safe because
// the allowlist decides who reads it. A signed-out response must carry no page
// and, more to the point, no token — a redirect that still ships the payload
// would leak every one of them.
const entrySignedOut = await fetch(`${BASE}/admin/entry-points`, { redirect: 'manual' });
const entryBody = entrySignedOut.status < 300 ? await entrySignedOut.text() : '';
record(
  'the entry points are not readable without signing in',
  entrySignedOut.status >= 300 || !entryBody.includes('Every live link'),
  `status ${entrySignedOut.status}`,
);
record(
  'and no franchisee token is in the signed-out response',
  !/request\/[A-Za-z0-9_-]{16,}/.test(entryBody),
  'a token appeared in the body of a page that redirects',
);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'Entry points' }).click();
await page.waitForLoadState('networkidle');
await expectVisible(page, 'h1:text-is("Entry points")', 'and are one click from the queue when you are');

// The walkthrough frames every participant's live link, so it gets the same
// two checks — and the tabs themselves, since they are the page.
const demoSignedOut = await fetch(`${BASE}/admin/demo`, { redirect: 'manual' });
const demoBody = demoSignedOut.status < 300 ? await demoSignedOut.text() : '';
record(
  'the walkthrough is not readable without signing in',
  demoSignedOut.status >= 300 || !demoBody.includes('Corporate reviewer'),
  `status ${demoSignedOut.status}`,
);
record(
  'and no franchisee token is in the signed-out response',
  !/request\/[A-Za-z0-9_-]{16,}/.test(demoBody) && !/accessToken/.test(demoBody),
  'a token appeared in the body of a page that redirects',
);
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'Walkthrough' }).click();
await page.waitForLoadState('networkidle');
await expectVisible(page, 'iframe[src*="/request/"]', 'the walkthrough opens on the franchisee view of a request');
await page.getByRole('button', { name: 'Corporate dashboard', exact: true }).click();
await expectVisible(page, 'iframe[src$="/freshbites/corporate"]', 'and its corporate tab opens the dashboard');

// ------------------------------------------------------------------ accounts
// SPEC v2.3 §9b phase A, as its demo reads: a team member accepts an invite,
// sets a password and two-factor, signs in — and deactivation still locks them
// out, on their very next click. Then the forgotten-password loop.
console.log('\nAccounts (SPEC v2.3 §10): invite, sign up, two-factor, lockout, reset');

await removeSmokeAdmin();

await page.goto(`${BASE}/admin/team`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('name@signage.com').fill(SMOKE_ADMIN);
await page.getByRole('button', { name: 'Send invitation' }).click();
await expectVisible(page, `text=Invitation sent to ${SMOKE_ADMIN}`, 'a team member can invite another admin');

const inviteUrl = await latestLinkTo(SMOKE_ADMIN, 'invitation', /\/invite\/[A-Za-z0-9_-]+/);
record('and the invitation email carries the sign-up link', Boolean(inviteUrl), 'no /invite/ link in the email');

// The invitee is a different person: their own browser, no shared cookies.
const invitee = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const inviteePage = await invitee.newPage();
inviteePage.on('pageerror', (error) => pageErrors.push(error.message));

await inviteePage.goto(`${BASE}${inviteUrl}`, { waitUntil: 'networkidle' });
await expectVisible(inviteePage, 'h1:text-is("Create your account")', 'the link opens account creation');
await inviteePage.getByLabel('Your name').fill('Smoke Admin');
// The browser's own minlength would stop this before the server saw it; the
// server's rule is the one that protects the account, so that is what is tested.
await inviteePage.locator('input[autocomplete="new-password"]').evaluateAll((inputs) =>
  inputs.forEach((input) => input.removeAttribute('minlength')),
);
await inviteePage.getByLabel('Choose a password').fill('short');
await inviteePage.getByLabel('Confirm password').fill('short');
await inviteePage.getByRole('button', { name: 'Create my account' }).click();
await expectVisible(inviteePage, 'text=/at least 10 characters/', 'a short password is refused');

await inviteePage.getByLabel('Choose a password').fill(SMOKE_ADMIN_PASSWORD);
await inviteePage.getByLabel('Confirm password').fill(SMOKE_ADMIN_PASSWORD);
await inviteePage.getByRole('button', { name: 'Create my account' }).click();
await inviteePage.waitForURL('**/two-factor**', { timeout: TIMEOUT });
await expectVisible(
  inviteePage,
  'h1:text-is("Set up two-factor sign-in")',
  'accepting leads a Signage.com admin straight into two-factor setup',
);

await inviteePage.getByRole('button', { name: 'Set up my authenticator' }).click();
const secretLocator = inviteePage.getByTestId('totp-secret');
await secretLocator.waitFor({ state: 'visible', timeout: TIMEOUT });
const smokeSecret = (await secretLocator.textContent())?.trim() ?? '';
await inviteePage.getByLabel('Six-digit code').fill(totpCode(smokeSecret));
await inviteePage.getByRole('button', { name: 'Turn on two-factor' }).click();
await inviteePage.waitForURL(/\/admin$/, { timeout: TIMEOUT });
await expectVisible(inviteePage, 'h1:has-text("Request queue")', 'and a code from the new authenticator opens the console');

const reused = await fetch(`${BASE}${inviteUrl}`).then((r) => r.text());
record('the invitation link works once', reused.includes('Already accepted'));

// Signed out and back in: the account is real, not just the acceptance session.
await inviteePage.getByRole('button', { name: 'Sign out' }).click();
await inviteePage.waitForURL('**/sign-in**', { timeout: TIMEOUT });
await signInAsAdmin(inviteePage, {
  email: SMOKE_ADMIN,
  password: SMOKE_ADMIN_PASSWORD,
  totpSecret: smokeSecret,
});
await expectVisible(inviteePage, 'h1:has-text("Request queue")', 'the new admin signs in with password and code');

// Deactivated from the first admin's browser; locked out on the next click.
await page.goto(`${BASE}/admin/team`, { waitUntil: 'networkidle' });
page.once('dialog', (dialog) => dialog.accept());
await page
  .locator('div.rounded-xl', { hasText: SMOKE_ADMIN })
  .getByRole('button', { name: 'Deactivate' })
  .click();
await expectVisible(page, `div.rounded-xl:has-text("${SMOKE_ADMIN}") >> text=deactivated`, 'an admin can deactivate another');
await inviteePage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
record(
  'and the deactivated admin is locked out on their next click',
  inviteePage.url().includes('/sign-in'),
  `landed on ${inviteePage.url().replace(BASE, '')}`,
);

// Forgotten password: the same sentence whether or not the address exists, a
// link by email, and the old password stops working.
await page
  .locator('div.rounded-xl', { hasText: SMOKE_ADMIN })
  .getByRole('button', { name: 'Reactivate' })
  .click();
await expectVisible(page, `div.rounded-xl:has-text("${SMOKE_ADMIN}") >> text=Deactivate`, 'and reactivate them');

await inviteePage.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
await inviteePage.getByLabel('Email').fill('nobody@nowhere.test');
await inviteePage.getByRole('button', { name: 'Email me a reset link' }).click();
const unknownAnswer = await inviteePage.locator('text=/If an account exists/').textContent({ timeout: TIMEOUT });
await inviteePage.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
await inviteePage.getByLabel('Email').fill(SMOKE_ADMIN);
await inviteePage.getByRole('button', { name: 'Email me a reset link' }).click();
const knownAnswer = await inviteePage.locator('text=/If an account exists/').textContent({ timeout: TIMEOUT });
record(
  'asking for a reset says the same thing whether or not the account exists',
  unknownAnswer?.replace('nobody@nowhere.test', 'X') === knownAnswer?.replace(SMOKE_ADMIN, 'X'),
);

const resetUrl = await latestLinkTo(SMOKE_ADMIN, 'password_reset', /\/reset-password\/[A-Za-z0-9_-]+/);
record('and a real account gets a reset link by email', Boolean(resetUrl));
const NEW_PASSWORD = 'smoke-admin-password-2';
await inviteePage.goto(`${BASE}${resetUrl}`, { waitUntil: 'networkidle' });
await inviteePage.getByLabel('New password', { exact: false }).first().fill(NEW_PASSWORD);
await inviteePage.getByLabel('Confirm new password').fill(NEW_PASSWORD);
await inviteePage.getByRole('button', { name: 'Save new password' }).click();
await expectVisible(inviteePage, 'text=/Your password has been changed/', 'the reset link sets a new password');

await inviteePage.getByLabel('Email').fill(SMOKE_ADMIN);
await inviteePage.getByLabel('Password', { exact: false }).first().fill(SMOKE_ADMIN_PASSWORD);
await inviteePage.getByRole('button', { name: 'Sign in' }).click();
await expectVisible(inviteePage, "text=/That email and password don't match/", 'and the old password stops working');
await signInAsAdmin(inviteePage, { email: SMOKE_ADMIN, password: NEW_PASSWORD, totpSecret: smokeSecret });
await expectVisible(inviteePage, 'h1:has-text("Request queue")', 'the new one works, still behind two-factor');

await invitee.close();
await removeSmokeAdmin();

record('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
await removeSmokeArtifacts(createdCodes);
// Reached only on a clean finish, which is what makes the file mean "abandoned".
createdCodes.length = 0;
rememberCodes();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
