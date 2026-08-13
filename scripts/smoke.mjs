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
// It MUTATES the dev database (it accepts a quote). Reset with
// `npm run dev:db:reset`.

import { chromium } from 'playwright';
import pg from 'pg';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const TIMEOUT = 15_000;
const results = [];

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

/**
 * Put REQ-0016 back to `quote_ready` so the accept step is repeatable.
 *
 * The run accepts a quote, which is a real transition with a real event — so
 * without this the second run finds no button and fails on its own leftovers.
 * Scoped to the one demo request rather than re-seeding, so the rest of the
 * database keeps whatever state it had.
 */
async function rewindDemoQuote() {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ??
      `postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT ?? 5433}/postgres`,
  });
  await client.connect();
  try {
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
  } finally {
    await client.end();
  }
}

await rewindDemoQuote();

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

record('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
