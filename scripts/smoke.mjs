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

import { chromium } from 'playwright';
import pg from 'pg';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const TIMEOUT = 15_000;
const results = [];

/** The location the initial-setup section creates, and then removes. */
const SMOKE_LOCATION = 'Freshbites — Smoke Test';

/** A 1×1 PNG — the smallest thing that exercises the real upload path. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
    } finally {
      await client.query(`alter table request_events enable trigger request_events_append_only`);
    }
  });
}

/** Codes the run submits, so the tail-end cleanup can name them exactly. */
const createdCodes = [];
const captureCode = async () => createdCodes.push(await page.locator('h1').innerText());

await rewindDemoQuote();
await rewindChangeRequest();
await removeSmokeArtifacts();

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));

// ---------------------------------------------------------------- brand home
console.log('\nBrand home');
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=Your', 'the co-branded home renders');
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

// -------------------------------------------------------- change-request loop
console.log('\nAnswering a change request (REQ-0019)');
await page.goto(`${BASE}/freshbites/request/demo-oak-plaza-changes-requested`, {
  waitUntil: 'networkidle',
});
await expectVisible(page, 'h2:has-text("Update this item and resubmit")', 'only the flagged item is editable');
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
// /admin is the Signage.com team's real screen (Session 3); /dev is what is
// left of the temporary console — the corporate reviewer, until Session 4 sends
// their approval email. Together they close the loop, and this section is what
// proves it: submit -> prep -> corporate -> route -> price -> deliver -> accept
// -> install -> the location record grows.
console.log('\nThe operator console (/admin) and the reviewer stand-in (/dev)');

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await expectVisible(page, 'h1:has-text("Signage.com team")', '/admin refuses anyone who is not signed in');

// An address that is not on the allowlist gets nothing, even though the dev
// provider takes the browser's word for who it is.
await page.evaluate(() => {
  const select = document.querySelector('select');
  const option = document.createElement('option');
  option.value = 'stranger@example.com';
  select.appendChild(option);
  select.value = 'stranger@example.com';
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.getByRole('button', { name: 'Sign in' }).click();
await expectVisible(page, 'text=/not on the Signage.com team allowlist/', 'an address off the allowlist is refused');

await page.selectOption('select', 'team@signage.com');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/admin', { timeout: TIMEOUT });
await expectVisible(page, 'h1:has-text("Request queue")', 'an allowlisted address reaches the queue');
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

await page.goto(`${BASE}/dev/mail/${approvalEmail.id}`, { waitUntil: 'networkidle' });
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

// Decide everything from the fresh link.
await page.goto(`${BASE}/dev/mail/${reReview.id}`, { waitUntil: 'networkidle' });
const freshHref = await page
  .frameLocator('iframe')
  .locator('a:has-text("Approve")')
  .first()
  .getAttribute('href');
await page.goto(freshHref, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Approve this sign' }).first().click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' });
const stillPending = await page.getByRole('button', { name: 'Approve this sign' }).count();
if (stillPending > 0) {
  await page.getByRole('button', { name: 'Approve this sign' }).first().click();
  await page.waitForTimeout(1500);
}
await expectVisible(page, 'text=/Every item on this request has been decided|already proceeding/', 'both items end up decided');

// Single-use: once the review is complete the link retires itself.
await page.goto(freshHref, { waitUntil: 'networkidle' });
await expectVisible(page, 'h1:has-text("This review is complete")', 'the link retires once the review is done');

await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Route for quote' }).click();
// The pylon's per-item override disagrees with the brand policy, so ONE request
// becomes TWO packages (SPEC §4) — the case the Freshbites seed exists to prove.
await expectCount(
  page,
  'section:has(h2:text-is("Next step")) li',
  2,
  'routing splits the request into two vendor packages',
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

// The external tail: the vendor quotes and orders off-platform, the team logs it.
await page.goto(admin, { waitUntil: 'networkidle' });
await page.locator('input[placeholder="Vendor total"]').fill('9000');
await page.getByRole('button', { name: 'Log vendor quote' }).click();
await expectVisible(page, 'text=/Vendor quote logged/', 'the external tail logs what the vendor quoted');

await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Log order placed' }).click();
await expectVisible(page, 'text=/Order logged/', 'the external order is logged, not accepted in-app');

await page.goto(admin, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Mark installed' }).click();
await expectVisible(page, 'text=/Installed — location record updated/', 'the request completes');

// The point of the whole system: the location record grew.
await page.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
await expectVisible(page, 'text=Freshbites Road Sign', 'the new sign is on the location record');

record('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
await removeSmokeArtifacts(createdCodes);

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
