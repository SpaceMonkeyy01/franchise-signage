// Screenshots of the main screens at phone, laptop and monitor widths.
//
//   npm run shots                       (needs `npm run dev` already running)
//   npm run shots -- --widths 1920,390  (any widths, comma-separated)
//
// Signs in as each role, opens its screens at each width, saves a PNG per
// screen and width to shots/ (gitignored), and FAILS if any page scrolls
// sideways — the one layout break a person notices at once and a smoke test
// never looks for. Read-only: it changes nothing in the database.
//
// Brand screens are opened on the brand's own address (freshbites.localhost),
// because that is where a brand's accounts sign in.

import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';

import { chromium } from 'playwright';
import pg from 'pg';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const BRAND_BASE = process.env.SHOTS_BRAND_URL ?? 'http://freshbites.localhost:3000';
const OUT = 'shots';
const widthsArg = process.argv.indexOf('--widths');
const WIDTHS = (widthsArg > 0 ? process.argv[widthsArg + 1] : '1920,1280,390')
  .split(',')
  .map(Number);

// The seeded dev accounts (src/lib/auth/dev-auth.ts).
const FRANCHISEE = { email: 'dana@freshbites-austin.com', password: 'franchisee-dev-password' };
const BRAND_ADMIN = { email: 'brand@freshbites.com', password: 'corporate-dev-password' };
const TEAM = {
  email: 'team@signage.com',
  password: 'signage-dev-password',
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
};

function totpCode(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret) {
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

/** One query, retried: the dev database serves one connection at a time. */
async function sample() {
  for (let attempt = 0; ; attempt++) {
    const client = new pg.Client({
      connectionString:
        process.env.DATABASE_URL ??
        `postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT ?? 5433}/postgres`,
    });
    client.on('error', () => {});
    try {
      await client.connect();
      const request = (
        await client.query(
          `select r.id, r.access_token from requests r join brands b on b.id = r.brand_id
            where b.slug = 'freshbites' and r.status <> 'draft'
            order by (select count(*) from line_items li where li.request_id = r.id) desc
            limit 1`,
        )
      ).rows[0];
      const location = (
        await client.query(
          `select l.id from locations l join brands b on b.id = l.brand_id
            where b.slug = 'freshbites' order by l.created_at limit 1`,
        )
      ).rows[0];
      await client.end();
      return { request, location };
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt > 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function brandSignIn(page, { email, password }) {
  await page.goto(`${BRAND_BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
}

async function teamSignIn(page) {
  await page.goto(`${BASE}/sign-in?next=/admin`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(TEAM.email);
  await page.getByLabel('Password', { exact: false }).first().fill(TEAM.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/two-factor**');
  await page.getByLabel('Six-digit code').fill(totpCode(TEAM.totpSecret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/admin$/);
}

const { request, location } = await sample();

const roles = [
  {
    role: 'public',
    signIn: null,
    screens: { front: `${BASE}/`, portal: `${BRAND_BASE}/`, 'sign-in': `${BRAND_BASE}/sign-in` },
  },
  {
    role: 'franchisee',
    signIn: (page) => brandSignIn(page, FRANCHISEE),
    screens: {
      stores: `${BRAND_BASE}/freshbites`,
      request: `${BRAND_BASE}/freshbites/request/${request.access_token}`,
      'new-request': `${BRAND_BASE}/freshbites/location/${location.id}/request`,
      setup: `${BRAND_BASE}/freshbites/setup`,
    },
  },
  {
    role: 'corporate',
    signIn: (page) => brandSignIn(page, BRAND_ADMIN),
    screens: {
      dashboard: `${BRAND_BASE}/freshbites/corporate`,
      approvals: `${BRAND_BASE}/freshbites/corporate?tab=approvals`,
      signs: `${BRAND_BASE}/freshbites/corporate?tab=signs`,
      people: `${BRAND_BASE}/freshbites/corporate?tab=people`,
    },
  },
  {
    role: 'team',
    signIn: teamSignIn,
    screens: {
      queue: `${BASE}/admin`,
      request: `${BASE}/admin/request/${request.id}`,
      catalog: `${BASE}/admin/catalog`,
    },
  },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const overflows = [];
let saved = 0;

for (const { role, signIn, screens } of roles) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  if (signIn) await signIn(page);
  for (const [name, url] of Object.entries(screens)) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width > 500 ? 1080 : 844 });
      await page.goto(url, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) overflows.push(`${role}/${name} at ${width}px: ${overflow}px too wide`);
      await page.screenshot({ path: `${OUT}/${role}-${name}-${width}.png`, fullPage: true });
      saved += 1;
    }
  }
  await context.close();
}
await browser.close();

console.log(`${saved} screenshots in ${OUT}/ at ${WIDTHS.join(', ')}px`);
if (overflows.length > 0) {
  console.log('\nPages that scroll sideways:');
  for (const line of overflows) console.log(`  FAIL  ${line}`);
  process.exit(1);
}
console.log('No page scrolls sideways.');
