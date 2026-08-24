// The welcome email (SPEC §8d) — what it must say, and what it must not.
//
// This is the first thing a franchisee ever sees from the product, sent at
// agreement signing, and three of its ways of being wrong are silent:
//
// 1. A budget figure that disagrees with the PDF it links to. The franchisee
//    forwards one to a lender and reads the other; both are ours.
// 2. Custom items folded into the total, producing a number nobody quoted.
// 3. A link to the DID, which is Session 8 and has no destination — a 404 in
//    the welcome email is the worst 404 in the build.
//
// None of them looks broken in a rendered message, so they are pinned here.

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { totalsFor, toQuantityLines, budgetMoney, type FormatBudget } from '../../budget';
import type { BrandItemRow } from '../../db/queries';
import { render } from '../layout';
import { WelcomeEmail } from '../templates/welcome';

const item = (id: string, name: string, est_price: string | null, sort_order = 0): BrandItemRow => ({
  id,
  name,
  spec_summary: null,
  site_variables: [],
  est_price,
  render_key: null,
  vendor_policy_override: null,
  sort_order,
});

// The Freshbites seed's prices, so these fail if the seed moves under them.
const STOREFRONT = item('fb_storefront', 'Freshbites Storefront Letters', '8400.00', 0);
const FROSTING = item('fb_frosting', 'Freshbites Window Frosting', null, 1);
const LOBBY = item('fb_lobby', 'Freshbites Lobby Letters', '2900.00', 2);
const ENTRANCE = item('fb_entrance', 'Freshbites Entrance Sign', null, 3);
const ROAD = item('fb_road', 'Freshbites Road Sign', null, 4);

const BRAND = { name: 'Freshbites', brand_colors: { primary: '#2E7D32' } };
const WELCOME_URL = 'http://localhost:3000/freshbites/welcome/tok_abc';

/** What budgetByFormat produces for one seeded package, without a database. */
function budgetFor(
  format: FormatBudget['format'],
  formatLabel: string,
  packageLabel: string,
  items: BrandItemRow[],
): FormatBudget {
  const lines = toQuantityLines(items);
  return { format, formatLabel, packageLabel, lineCount: lines.length, ...totalsFor(lines) };
}

const INLINE = budgetFor('inline', 'Inline', 'Inline storefront', [
  STOREFRONT,
  FROSTING,
  LOBBY,
  ENTRANCE,
]);
const ENDCAP = budgetFor('endcap', 'Endcap', 'Endcap', [
  STOREFRONT,
  STOREFRONT,
  FROSTING,
  LOBBY,
  ENTRANCE,
]);
const FREESTANDING = budgetFor('freestanding', 'Freestanding', 'Freestanding', [
  STOREFRONT,
  ROAD,
  FROSTING,
  LOBBY,
  ENTRANCE,
]);

const welcome = (budgets: FormatBudget[], name: string | null = 'Dana Whitfield') =>
  render(createElement(WelcomeEmail, { brand: BRAND, name, budgets, welcomeUrl: WELCOME_URL }));

/**
 * The copy alone, with the markup stripped.
 *
 * The "must not say" assertions below are about what a franchisee READS, and
 * inline styles are full of words that are not copy — `border-bottom` contains
 * "order", which fails an honest test for a dishonest reason.
 */
const prose = (html: string) => html.replace(/<[^>]*>/g, ' ').toLowerCase();

describe('the signage number', () => {
  it('is the one the budget one-pager totals, format by format', async () => {
    // Same arithmetic, not a second implementation: both call totalsFor. The
    // assertion is that the email actually PRINTS it.
    const html = await welcome([INLINE, ENDCAP, FREESTANDING]);

    expect(INLINE.priced).toBe(11_300);
    expect(ENDCAP.priced).toBe(19_700); // two elevations of storefront letters
    expect(html).toContain(budgetMoney(INLINE.priced));
    expect(html).toContain(budgetMoney(ENDCAP.priced));
  });

  it('leaves custom items out of the figure and says so once, not per row', async () => {
    const html = await welcome([INLINE, ENDCAP, FREESTANDING]);

    // Freestanding carries three unpriced lines (road sign, frosting, entrance)
    // and still totals the two priced ones — a lender reading $11,300 as "all
    // of it" is the failure this caveat exists to prevent.
    expect(FREESTANDING.priced).toBe(11_300);
    expect(FREESTANDING.customLines).toBe(3);
    expect(html).toContain('3 items are');
    expect(html.match(/quoted per site/g)).toHaveLength(1);
    expect(html).toContain('An estimate, not a quote');
  });

  it('shows every format, because at signing nobody knows which one they will get', async () => {
    const html = await welcome([INLINE, ENDCAP, FREESTANDING]);

    for (const label of ['Inline', 'Endcap', 'Freestanding']) expect(html).toContain(label);
  });
});

describe('the links', () => {
  it('carries the registration link and no other destination', async () => {
    const html = await welcome([INLINE]);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual([WELCOME_URL]);
  });

  it('never links the DID, which does not exist yet (SPEC §8c is Session 8)', async () => {
    const html = await welcome([INLINE, ENDCAP, FREESTANDING]);

    // The stage after this one is described in words on purpose. A button here
    // would 404 in the first message a franchisee ever receives.
    expect(html).toContain('candidate site');
    expect(html).not.toMatch(/href="[^"]*\/did/i);
  });
});

describe('what it must not say', () => {
  it('keeps ordering invisible — nothing is orderable at agreement signing', async () => {
    const html = await welcome([INLINE, ENDCAP, FREESTANDING]);

    // SPEC §8d: "Signage ordering stays invisible; nothing about it is relevant
    // yet." There is no lease, no location, and nothing to install a sign on.
    for (const word of ['order', 'request signage', 'checkout', 'cart', 'install']) {
      expect(prose(html)).not.toContain(word);
    }
  });

  it('does not promise a delivery date, an approval, or a permit', async () => {
    const html = await welcome([INLINE]);

    for (const word of ['permit', 'approved', 'guarantee', 'weeks']) {
      expect(prose(html)).not.toContain(word);
    }
  });
});

describe('degradation', () => {
  it('still sends something when the brand has no packages priced yet', async () => {
    // A misconfigured brand must not become a franchisee who was registered and
    // then heard from nobody. The budget block drops; the link survives.
    const html = await welcome([]);

    expect(html).toContain(WELCOME_URL);
    expect(html).toContain('candidate site');
    expect(html).not.toContain('$0');
  });

  it('drops the greeting rather than inventing a name', async () => {
    // Registration requires an email; the name is optional (SPEC §8d).
    const html = await welcome([INLINE], null);

    expect(html).not.toContain('Hi ');
    expect(html).toContain(WELCOME_URL);
  });
});
