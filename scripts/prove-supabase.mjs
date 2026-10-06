// docs/SUPABASE.md §7, steps 7.1.2–7.4, driven in a browser against the LIVE
// project: real Supabase Auth, real TOTP, links read from the live outbox.
//
//   node scripts/prove-supabase.mjs --email-base you@example.com
//
// Needs `npm run dev` running in Supabase mode (the four lines in .env.local
// switched on, RESEND_API_KEY off so nothing is delivered). It WRITES to the
// live project: it creates accounts on `+alias` addresses of --email-base,
// applies the owner backfill, approves one demo item, and registers one
// franchisee. Nothing is deleted.
//
// Resumable: what each phase created (passwords, TOTP secrets) is kept in
// --state (default .prove-supabase.json, gitignored), and a phase already
// passed is skipped. Run one phase with --only A|B|C|D.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { config as loadEnv } from 'dotenv';
import { chromium } from 'playwright';
import pg from 'pg';

loadEnv({ path: '.env.local' });

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const EMAIL_BASE = arg('email-base');
const ONLY = arg('only');
const STATE_FILE = arg('state') ?? '.prove-supabase.json';
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const TIMEOUT = 30_000;

if (!EMAIL_BASE || !process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('Needs --email-base, and DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL (Supabase mode on).');
  process.exit(1);
}
const [local, domain] = EMAIL_BASE.split('@');
const alias = (tag) => `${local}+${tag}@${domain}`;

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { passed: {} };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ------------------------------------------------------------------ helpers

function totpCode(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret.replace(/\s|=/g, '').toUpperCase()) {
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
  const offset = digest[digest.length - 1] & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** A code from a window nobody has used yet: Supabase refuses a TOTP code twice. */
const usedCodes = new Set();
async function freshCode(secret) {
  for (;;) {
    const code = totpCode(secret);
    if (!usedCodes.has(`${secret}:${code}`)) {
      usedCodes.add(`${secret}:${code}`);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function withDb(fn) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function latestLinkTo(to, kind, pattern) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const html = await withDb(async (client) =>
      (
        await client.query(
          `select html from sent_emails where to_email = $1 and kind = any($2) order by created_at desc limit 1`,
          [to, [kind].flat()],
        )
      ).rows[0]?.html ?? '',
    );
    const match = html.match(pattern)?.[0];
    if (match) return match.replaceAll('&amp;', '&');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}

const results = [];
const record = (label, passed, detail = '') => {
  results.push({ label, passed });
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return passed;
};
async function expectVisible(page, selector, label) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: TIMEOUT });
    return record(label, true);
  } catch {
    return record(label, false, `not visible: ${selector} (at ${page.url().replace(BASE, '')})`);
  }
}
async function expectCount(page, selector, expected, label) {
  const deadline = Date.now() + TIMEOUT;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = await page.locator(selector).count();
    if (seen === expected) return record(label, true);
    await page.waitForTimeout(250);
  }
  return record(label, false, `saw ${seen}, expected ${expected}`);
}

/** Accept an invitation: name, password; returns the TOTP secret if two-factor setup follows. */
async function acceptInvite(page, url, { name, password, twoFactor }) {
  await page.goto(url.startsWith('http') ? url : `${BASE}${url}`, { waitUntil: 'networkidle' });
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Choose a password').fill(password);
  await page.getByLabel('Confirm password').fill(password);
  // An owner's sign-up also asks for a company (new registrations) and whether
  // the lease is signed; "Not yet" lands on their home either way.
  const company = page.getByLabel('Company name');
  if (await company.count()) await company.fill(`${name} Co`);
  const notYet = page.getByText('Not yet', { exact: true });
  if (await notYet.count()) await notYet.click();
  await page.getByRole('button', { name: 'Create my account' }).click();
  if (!twoFactor) return null;
  await page.waitForURL('**/two-factor**', { timeout: TIMEOUT });
  await page.getByRole('button', { name: 'Set up my authenticator' }).click();
  const secretLocator = page.getByTestId('totp-secret');
  await secretLocator.waitFor({ state: 'visible', timeout: TIMEOUT });
  const secret = (await secretLocator.textContent())?.trim() ?? '';
  await page.getByLabel('Six-digit code').fill(await freshCode(secret));
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();
  return secret;
}

async function signInAsAdmin(page, { email, password, secret }) {
  await page.goto(`${BASE}/sign-in?next=/admin`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/two-factor**', { timeout: TIMEOUT });
  await page.getByLabel('Six-digit code').fill(await freshCode(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/admin$/, { timeout: TIMEOUT });
}

async function signInWithPassword(page, { email, password }, next) {
  await page.goto(next ? `${BASE}/sign-in?next=${encodeURIComponent(next)}` : `${BASE}/sign-in`, {
    waitUntil: 'networkidle',
  });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Run an npm script against the live project and return its output. */
function npm(...args) {
  return execFileSync('npm', ['run', '--silent', ...args], {
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
}

const browser = await chromium.launch({ channel: 'msedge' });
const pageErrors = [];
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return page;
}
const want = (phase) => (!ONLY || ONLY === phase) && (ONLY === phase || !state.passed[phase]);

// ------------------------------------------------- 7.1 phase A — Signage.com

if (want('A')) {
  console.log('\n7.1 · Phase A — Signage.com (live Supabase Auth)');
  const before = results.length;
  state.admin ??= { email: alias('admin'), password: `prove-admin-${Date.now().toString(36)}` };
  state.admin2 ??= { email: alias('admin2'), password: `prove-admin2-${Date.now().toString(36)}` };
  save();

  const page = await newPage();
  if (!state.admin.secret) {
    const out = npm('invite', '--', state.admin.email);
    const url = out.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]+/)?.[0];
    record('npm run invite prints a link for the first admin', Boolean(url));
    state.admin.secret = await acceptInvite(page, url, { name: 'Prove Admin', password: state.admin.password, twoFactor: true });
    save();
    await page.waitForURL(/\/admin$/, { timeout: TIMEOUT });
    await expectVisible(page, 'h1:has-text("Request queue")', '7.1.1 accept, password, authenticator: lands on /admin');
  }

  // 7.1.2 — out and back in.
  await page.context().clearCookies();
  await signInAsAdmin(page, state.admin);
  await expectVisible(page, 'h1:has-text("Request queue")', '7.1.2 signs in again with password, then code');

  // 7.1.3 — a second admin, then deactivated: signed out on their next click.
  const second = await newPage();
  if (!state.admin2.secret) {
    await page.goto(`${BASE}/admin/people`, { waitUntil: 'networkidle' });
    await page.getByRole('radio', { name: /Signage\.com admin/ }).check();
    await page.getByLabel('Email', { exact: true }).fill(state.admin2.email);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expectVisible(page, `text=Invitation sent to ${state.admin2.email}`, '7.1.3 the console invites a second admin');
    const url = await latestLinkTo(state.admin2.email, 'invitation', /\/invite\/[A-Za-z0-9_-]+/);
    record('and the invitation reaches the live outbox', Boolean(url));
    state.admin2.secret = await acceptInvite(second, url, { name: 'Prove Admin Two', password: state.admin2.password, twoFactor: true });
    save();
    await second.waitForURL(/\/admin$/, { timeout: TIMEOUT });
  } else {
    await signInAsAdmin(second, state.admin2);
  }
  await expectVisible(second, 'h1:has-text("Request queue")', 'the second admin is in, in another browser');

  await page.goto(`${BASE}/admin/people?type=team`, { waitUntil: 'networkidle' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`tr[data-account="${state.admin2.email}"]`).getByRole('button', { name: 'Deactivate' }).click();
  await expectVisible(page, `tr[data-account="${state.admin2.email}"] >> text=deactivated`, 'the first admin deactivates them');
  await second.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  record('the second browser is signed out on its next click', second.url().includes('/sign-in'), second.url().replace(BASE, ''));
  await page.locator(`tr[data-account="${state.admin2.email}"]`).getByRole('button', { name: 'Reactivate' }).click();
  await expectVisible(page, `tr[data-account="${state.admin2.email}"] >> text=Deactivate`, 'and reactivates them');

  // 7.1.4 — forgot password, from a third browser (another device).
  const device = await newPage();
  await device.goto(`${BASE}/forgot-password`, { waitUntil: 'networkidle' });
  await device.getByLabel('Email').fill(state.admin2.email);
  await device.getByRole('button', { name: 'Email me a reset link' }).click();
  await expectVisible(device, 'text=/If an account exists/', '7.1.4 asking for a reset');
  const resetUrl = await latestLinkTo(state.admin2.email, 'password_reset', /\/reset-password\/[A-Za-z0-9_-]+/);
  record('and the reset link reaches the outbox', Boolean(resetUrl));
  const newPassword = `${state.admin2.password}-reset`;
  await device.goto(`${BASE}${resetUrl}`, { waitUntil: 'networkidle' });
  await device.getByLabel('New password', { exact: false }).first().fill(newPassword);
  await device.getByLabel('Confirm new password').fill(newPassword);
  await device.getByRole('button', { name: 'Save new password' }).click();
  await expectVisible(device, 'text=/Your password has been changed/', 'the reset link works on a different device');
  await device.getByLabel('Email').fill(state.admin2.email);
  await device.getByLabel('Password', { exact: false }).first().fill(state.admin2.password);
  await device.getByRole('button', { name: 'Sign in' }).click();
  await expectVisible(device, "text=/That email and password don't match/", 'and the old password stops working');
  state.admin2.password = newPassword;
  save();
  await signInAsAdmin(device, state.admin2);
  await expectVisible(device, 'h1:has-text("Request queue")', 'the new password works, still behind two-factor');

  if (results.slice(before).every((r) => r.passed)) state.passed.A = true;
  save();
}

// ------------------------------------------------ 7.2 phase B — franchisees

if (want('B')) {
  console.log('\n7.2 · Phase B — franchisees');
  const before = results.length;
  if (!state.owner) {
    const out = npm('backfill-owners', '--', '--apply');
    const email = out.match(/ {2}(\S+@\S+): company created/)?.[1];
    const url = out.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]+/)?.[0];
    record('7.2.1 the backfill applies and prints an accept link', Boolean(email && url), email ?? out.slice(0, 200));
    state.owner = { email, url, password: `prove-owner-${Date.now().toString(36)}` };
    save();
  }
  const owner = await newPage();
  if (!state.owner.accepted) {
    await acceptInvite(owner, state.owner.url, { name: 'Dana Whitfield', password: state.owner.password, twoFactor: false });
    await owner.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
    state.owner.accepted = true;
    save();
  } else {
    await signInWithPassword(owner, state.owner);
    await owner.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
  }
  await expectVisible(owner, 'h2:text-is("Freshbites — Oak Plaza")', '7.2.2 the owner lands on My stores, with their stores');
  await expectVisible(owner, 'h2:text-is("Freshbites — Cedar Park")', 'both of that company’s stores');

  const token = await withDb(async (client) =>
    (await client.query(`select access_token from requests where code = 'REQ-0016'`)).rows[0]?.access_token,
  );
  const signedOut = await newPage();
  await signedOut.goto(`${BASE}/freshbites/request/${token}`, { waitUntil: 'networkidle' });
  await expectVisible(signedOut, 'text=REQ-0016', '7.2.3 a request link opens signed out');
  await expectVisible(signedOut, 'a:has-text("Sign in to accept")', 'and offers "Sign in to accept"');
  await expectCount(signedOut, 'button:has-text("Accept quote")', 0, 'never the Accept button');

  if (results.slice(before).every((r) => r.passed)) state.passed.B = true;
  save();
}

// -------------------------------------------------- 7.3 phase C — corporate

if (want('C')) {
  console.log('\n7.3 · Phase C — corporate');
  const before = results.length;
  for (const [key, role, name] of [
    ['brandAdmin', 'brand_admin', 'Prove Brand Admin'],
    ['reviewer', 'brand_reviewer', 'Prove Reviewer'],
  ]) {
    state[key] ??= { email: alias(role.replace('_', '')), password: `prove-${role}-${Date.now().toString(36)}`, name };
    if (!state[key].accepted) {
      const out = npm('invite', '--', state[key].email, '--role', role, '--brand', 'freshbites');
      const url = out.match(/https?:\/\/\S+\/invite\/[A-Za-z0-9_-]+/)?.[0];
      record(`7.3.1 ${role} invited`, Boolean(url));
      const page = await newPage();
      await acceptInvite(page, url, { name, password: state[key].password, twoFactor: false });
      await page.waitForURL(/\/freshbites\/corporate/, { timeout: TIMEOUT });
      record(`and accepted: lands on the corporate dashboard`, true);
      state[key].accepted = true;
      save();
    }
  }

  // 7.3.2 — the reviewer approves from the dashboard; the email link then says so.
  const admin = await newPage();
  await signInWithPassword(admin, state.brandAdmin, '/freshbites/corporate?tab=approvals');
  await admin.waitForURL(/\/freshbites\/corporate/, { timeout: TIMEOUT });
  const review = admin.locator('section[data-request-code="REQ-0018"]');
  await review.getByRole('button', { name: /Send the approval email again/ }).click();
  const reviewHref = await latestLinkTo(state.reviewer.email, ['review_requested_again', 'review_requested'], /https?:\/\/[^"'\s<>]+\/review\/[^"'\s<>]+/);
  record('7.3.2 the approval email reaches the reviewer’s outbox', Boolean(reviewHref));

  const reviewer = await newPage();
  await signInWithPassword(reviewer, state.reviewer, '/freshbites/corporate?tab=approvals');
  await reviewer.waitForURL(/\/freshbites\/corporate/, { timeout: TIMEOUT });
  await reviewer
    .locator('section[data-request-code="REQ-0018"]')
    .getByRole('button', { name: 'Approve', exact: true })
    .first()
    .click();
  await expectVisible(reviewer, 'text=/approved\\./', 'the reviewer approves from the dashboard');
  await admin.goto(reviewHref, { waitUntil: 'networkidle' });
  // With other signs still waiting, the button names who decided and how; when
  // that was the last one, the review is complete and the link retires itself.
  await expectVisible(
    admin,
    `text=/already approved by ${state.reviewer.name} from the dashboard|This review is complete/`,
    'the email’s button then says it is already decided',
  );

  // 7.3.3 — the brand admin registers a franchisee; the welcome email signs them up.
  state.franchisee ??= { email: alias('franchisee'), password: `prove-franchisee-${Date.now().toString(36)}` };
  save();
  await admin.goto(`${BASE}/freshbites/corporate?tab=people`, { waitUntil: 'networkidle' });
  const registrations = admin.locator('[data-registrations="people"]');
  await registrations.locator('input[type="email"]').fill(state.franchisee.email);
  await registrations.getByRole('button', { name: /Register/i }).click();
  await expectVisible(admin, `[data-registrations="people"] >> text=${state.franchisee.email}`, '7.3.3 the brand admin registers a franchisee');
  const welcome = await latestLinkTo(state.franchisee.email, 'welcome', /\/invite\/[A-Za-z0-9_-]+/);
  record('the welcome email is in the outbox, with "Create your account"', Boolean(welcome));
  const newcomer = await newPage();
  await acceptInvite(newcomer, welcome, { name: 'Prove Franchisee', password: state.franchisee.password, twoFactor: false });
  await newcomer.waitForURL(/\/freshbites/, { timeout: TIMEOUT });
  record('and its link signs them up', !newcomer.url().includes('/invite/'), newcomer.url().replace(BASE, ''));

  if (results.slice(before).every((r) => r.passed)) state.passed.C = true;
  save();
}

// ------------------------------------------------------ 7.4 phase D — staff

if (want('D')) {
  console.log('\n7.4 · Phase D — staff');
  const before = results.length;
  state.manager ??= { email: alias('manager'), password: `prove-manager-${Date.now().toString(36)}` };
  save();

  const owner = await newPage();
  await signInWithPassword(owner, state.owner);
  await owner.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
  await owner.goto(`${BASE}/freshbites/staff`, { waitUntil: 'networkidle' });
  await owner.locator('#staff-email').fill(state.manager.email);
  await owner.locator('form label:has-text("Freshbites — Cedar Park") input').check();
  await owner.getByRole('button', { name: 'Send invitation' }).click();
  await expectVisible(owner, `text=Invitation sent to ${state.manager.email}`, '7.4.1 the owner invites a manager to one store');
  const link = await latestLinkTo(state.manager.email, 'invitation', /\/invite\/[A-Za-z0-9_-]+/);
  const manager = await newPage();
  await acceptInvite(manager, link, { name: 'Prove Manager', password: state.manager.password, twoFactor: false });
  await manager.waitForURL(/\/freshbites$/, { timeout: TIMEOUT });
  await expectVisible(manager, 'h2:text-is("Freshbites — Cedar Park")', 'the manager sees that store');
  await expectCount(manager, 'h2:text-is("Freshbites — Oak Plaza")', 0, 'and no other');

  const admin = await newPage();
  await signInWithPassword(admin, state.brandAdmin, '/freshbites/corporate?tab=people');
  await admin.waitForURL(/\/freshbites\/corporate/, { timeout: TIMEOUT });
  // The backfill names the company after its requester (scripts/backfill-owners.ts).
  const austin = admin.locator('[data-franchisee="Dana Whitfield (franchisee)"]');
  await austin.getByRole('button').first().click();
  const row = austin.locator(`[data-staff="${state.manager.email}"]`);
  await row.locator('label:has-text("Freshbites — Oak Plaza") input').check();
  await row.getByRole('button', { name: 'Save stores' }).click();
  await expectCount(admin, `[data-staff="${state.manager.email}"] button:has-text("Save stores")`, 0, '7.4.2 the brand admin changes the manager’s stores');
  await manager.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
  await expectVisible(manager, 'h2:text-is("Freshbites — Oak Plaza")', 'and the manager sees it on their next click');

  admin.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expectVisible(admin, `[data-staff="${state.manager.email}"] >> text=deactivated`, 'the brand admin deactivates them');
  await manager.goto(`${BASE}/freshbites`, { waitUntil: 'networkidle' });
  await expectCount(manager, 'h2:has-text("Freshbites —")', 0, 'and their next click shows nothing');

  if (results.slice(before).every((r) => r.passed)) state.passed.D = true;
  save();
}

record('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed · phases passed: ${Object.keys(state.passed).join(', ') || 'none'}`);
process.exit(failed.length === 0 ? 0 : 1);
