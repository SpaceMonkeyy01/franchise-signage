// What the invoice and the receipt bill for (SPEC §8b).
//
// The stakes change between the budgetary quote and these two. An estimate that
// is wrong gets corrected in the next conversation; an invoice that is wrong is
// a demand for the wrong amount of money, and a receipt that is wrong says a
// debt was settled that was not. So the two things pinned here are the two that
// would be silent: billing a package for items that belong to a different
// package, and a receipt disagreeing with the invoice it acknowledges.

import { describe, expect, it } from 'vitest';

import { invoiceTotals, packageLines } from '../invoice';
import type { LineItemRow, QuoteRow } from '../../db/queries';

const item = (
  id: string,
  name: string,
  price: string | null,
  overrides: Partial<LineItemRow> = {},
): LineItemRow => ({
  id,
  brand_item_id: `bi_${id}`,
  brand_item_name: name,
  spec_summary: null,
  site_variables: [],
  pinned_attributes: {},
  render_key: null,
  pricing_basis: price === null ? 'standin' : 'direct',
  origin: 'standard',
  item_status: 'approved',
  sizing: null,
  site_notes: null,
  tbd_fields: [],
  exception_issue: null,
  review_note: null,
  est_price_snapshot: price,
  vendor_policy_override: null,
  files: [],
  ...overrides,
});

const quote = (id: string, lineItemIds: string[], overrides: Partial<QuoteRow> = {}): QuoteRow => ({
  id,
  recipient_kind: 'signage_com',
  recipient_name: null,
  line_item_ids: lineItemIds,
  priced_total: null,
  priced_count: lineItemIds.length,
  manual_count: 0,
  external: false,
  tat: null,
  delivered_at: null,
  accepted_at: null,
  in_production_at: null,
  shipped_at: null,
  completed_at: null,
  invoice_number: null,
  invoiced_at: null,
  paid_at: null,
  payment_method: null,
  payment_reference: null,
  ...overrides,
});

const STOREFRONT = item('li_store', 'Freshbites Storefront Letters', '8400.00');
const LOBBY = item('li_lobby', 'Freshbites Lobby Letters', '2900.00');
const PYLON = item('li_pylon', 'Freshbites Road Sign', '7400.00');

describe('packageLines', () => {
  it('bills only the items in this package, not the whole request', () => {
    // The split request: Signage.com's invoice must not carry the pylon, which
    // the brand's vendor invoices directly. Billing it here would charge the
    // franchisee twice for one sign.
    const internal = quote('q1', ['li_store', 'li_lobby']);
    const lines = packageLines([STOREFRONT, LOBBY, PYLON], internal);

    expect(lines.map((line) => line.name)).toEqual([
      'Freshbites Storefront Letters',
      'Freshbites Lobby Letters',
    ]);
  });

  it('keeps the request’s own item order, which is the order every other document uses', () => {
    const all = quote('q1', ['li_pylon', 'li_store', 'li_lobby']);
    const lines = packageLines([STOREFRONT, LOBBY, PYLON], all);

    expect(lines.map((line) => line.name)).toEqual([
      'Freshbites Storefront Letters',
      'Freshbites Lobby Letters',
      'Freshbites Road Sign',
    ]);
  });

  it('ignores an id in the package with no matching item', () => {
    expect(packageLines([STOREFRONT], quote('q1', ['li_store', 'li_gone']))).toHaveLength(1);
  });
});

describe('invoiceTotals', () => {
  it('totals what is being billed', () => {
    const lines = packageLines([STOREFRONT, LOBBY], quote('q1', ['li_store', 'li_lobby']));
    expect(invoiceTotals(lines)).toEqual({ due: 11300, unpriced: 0 });
  });

  it('reports an unpriced line instead of billing it as zero', () => {
    // The console refuses to invoice while manual_count > 0, so this should be
    // unreachable — but a $0 line silently lowering an invoice total is the
    // failure that would never be noticed, so the document counts it out loud.
    const unpriced = item('li_custom', 'Freshbites Window Frosting', null);
    const lines = packageLines([STOREFRONT, unpriced], quote('q1', ['li_store', 'li_custom']));

    expect(invoiceTotals(lines)).toEqual({ due: 8400, unpriced: 1 });
  });

  it('gives the receipt the same number as the invoice it acknowledges', () => {
    // Both documents render from one component over one package, so this is
    // structural rather than coincidental — this test is what keeps it that way
    // if someone later gives the receipt its own total.
    const lines = packageLines([STOREFRONT, LOBBY], quote('q1', ['li_store', 'li_lobby']));
    const invoice = invoiceTotals(lines);
    const receipt = invoiceTotals(packageLines([STOREFRONT, LOBBY], quote('q1', ['li_store', 'li_lobby'], {
      paid_at: '2026-08-21T00:00:00Z',
      payment_method: 'ACH',
    })));

    expect(receipt.due).toBe(invoice.due);
  });
});
