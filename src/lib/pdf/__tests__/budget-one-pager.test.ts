// The arithmetic behind the budget one-pager (SPEC §8b).
//
// Worth pinning rather than eyeballing in a rendered PDF, because both ways this
// can be wrong are silent. Undercounting a duplicate produces a total that looks
// entirely reasonable and is short by the price of a sign; folding custom items
// into the total produces a number a lender would rely on that no one has
// actually quoted. Neither shows up as a broken-looking document.

import { describe, expect, it } from 'vitest';

import { totalsFor, toQuantityLines } from '../budget-one-pager';
import type { BrandItemRow } from '../../db/queries';

const item = (
  id: string,
  name: string,
  est_price: string | null,
  sort_order = 0,
): BrandItemRow => ({
  id,
  name,
  spec_summary: null,
  site_variables: [],
  est_price,
  render_key: null,
  vendor_policy_override: null,
  sort_order,
});

// The Freshbites seed's prices, so these tests fail if the seed moves under them.
const STOREFRONT = item('fb_storefront', 'Freshbites Storefront Letters', '8400.00', 0);
const FROSTING = item('fb_frosting', 'Freshbites Window Frosting', null, 1);
const LOBBY = item('fb_lobby', 'Freshbites Lobby Letters', '2900.00', 2);
const ENTRANCE = item('fb_entrance', 'Freshbites Entrance Sign', null, 3);
const ROAD = item('fb_road', 'Freshbites Road Sign', null, 4);

describe('toQuantityLines', () => {
  it('counts a repeated package entry as quantity, not as two lines', () => {
    // The endcap package: an endcap has two elevations to sign, so the seed
    // lists storefront letters twice on purpose (SPEC §3.2).
    const lines = toQuantityLines([STOREFRONT, STOREFRONT, FROSTING, LOBBY, ENTRANCE]);

    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ name: 'Freshbites Storefront Letters', quantity: 2 });
    expect(lines.filter((line) => line.name === 'Freshbites Storefront Letters')).toHaveLength(1);
  });

  it('keeps first-appearance order, which is the catalog sort order', () => {
    const lines = toQuantityLines([STOREFRONT, ROAD, FROSTING, LOBBY, ENTRANCE]);

    expect(lines.map((line) => line.name)).toEqual([
      'Freshbites Storefront Letters',
      'Freshbites Road Sign',
      'Freshbites Window Frosting',
      'Freshbites Lobby Letters',
      'Freshbites Entrance Sign',
    ]);
  });

  it('carries a null est_price through as a custom-quote line', () => {
    const lines = toQuantityLines([ROAD]);
    expect(lines[0].unitPrice).toBeNull();
  });
});

describe('totalsFor', () => {
  it('multiplies a quantity line by its unit price', () => {
    // Endcap: two storefront sets at 8,400 plus lobby letters at 2,900.
    const totals = totalsFor(toQuantityLines([STOREFRONT, STOREFRONT, FROSTING, LOBBY, ENTRANCE]));

    expect(totals.priced).toBe(8400 * 2 + 2900);
    expect(totals.customLines).toBe(2);
  });

  it('never folds a custom item into the priced total', () => {
    // Freestanding carries the pylon, which cannot be estimated before a site
    // is known. A total that quietly included a guess for it is the failure
    // this document exists to avoid.
    const totals = totalsFor(toQuantityLines([STOREFRONT, ROAD, FROSTING, LOBBY, ENTRANCE]));

    expect(totals.priced).toBe(8400 + 2900);
    expect(totals.customLines).toBe(3);
  });

  it('reports a zero total rather than guessing when nothing is priced', () => {
    const totals = totalsFor(toQuantityLines([ROAD, FROSTING]));

    expect(totals.priced).toBe(0);
    expect(totals.customLines).toBe(2);
  });

  it('counts custom lines once each, however many times the package repeats them', () => {
    const totals = totalsFor(toQuantityLines([ROAD, ROAD, ROAD]));

    expect(totals.customLines).toBe(1);
  });
});
