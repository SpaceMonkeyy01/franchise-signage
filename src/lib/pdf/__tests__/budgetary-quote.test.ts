// The arithmetic and the omissions behind the budgetary quote (SPEC §8b).
//
// Same reasoning as the one-pager's tests: every way this document can be wrong
// is silent. A total that quietly includes an unquoted pylon, a declined item
// still counted, or a split request presented as one payee all render as a
// perfectly ordinary-looking PDF — and a lender disburses against it.

import { describe, expect, it } from 'vitest';

import {
  fulfillerFor,
  quoteTotals,
  toDocumentLine,
  toQuoteSections,
  unpricedItems,
} from '../budgetary-quote';
import type { LineItemRow, QuoteRow } from '../../db/queries';

const BRAND = { vendor_name: 'Northline Sign Co.' };

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
  ...overrides,
});

// The Freshbites seed's shape: storefront and lobby priced, the pylon a standin.
const STOREFRONT = item('li_store', 'Freshbites Storefront Letters', '8400.00');
const LOBBY = item('li_lobby', 'Freshbites Lobby Letters', '2900.00');
const PYLON = item('li_pylon', 'Freshbites Pylon Sign', null);

describe('toDocumentLine', () => {
  it('prefers the captured sizing over the catalog spec as the line detail', () => {
    const line = toDocumentLine(
      item('li_a', 'Storefront Letters', '8400.00', {
        sizing: '22′ frontage · 30" letters',
        spec_summary: 'Channel letters, face-lit',
      }),
    );
    expect(line.detail).toBe('22′ frontage · 30" letters');
  });

  it('marks a TBD item on its own line, not only in a footnote', () => {
    const line = toDocumentLine(
      item('li_a', 'Storefront Letters', '8400.00', { tbd_fields: ['frontage'] }),
    );
    expect(line.detail).toContain('site details TBD');
  });

  it('carries a null snapshot through as a custom-quote line', () => {
    expect(toDocumentLine(PYLON).unitPrice).toBeNull();
  });

  it('never collapses two rows of the same item, which carry different sizings', () => {
    // An endcap signs two elevations, and the vendor quotes them as two lines.
    const sections = toQuoteSections(
      [STOREFRONT, { ...STOREFRONT, id: 'li_store_2' }],
      [quote('q1', ['li_store', 'li_store_2'])],
      BRAND,
    );
    expect(sections[0].lines).toHaveLength(2);
    expect(sections[0].subtotal).toBe(8400 * 2);
  });
});

describe('toQuoteSections', () => {
  it('takes the package contents from the quote, not from item status', () => {
    // The quote is what routing actually sent and what its total was summed
    // from; an approved item that never made it into a package is not in it.
    const sections = toQuoteSections(
      [STOREFRONT, LOBBY, PYLON],
      [quote('q1', ['li_store', 'li_lobby'])],
      BRAND,
    );
    expect(sections[0].lines.map((line) => line.name)).toEqual([
      'Freshbites Storefront Letters',
      'Freshbites Lobby Letters',
    ]);
  });

  it('splits a routed-two-ways request into a section per payee', () => {
    const sections = toQuoteSections(
      [STOREFRONT, LOBBY, PYLON],
      [
        quote('q1', ['li_store', 'li_lobby']),
        quote('q2', ['li_pylon'], {
          external: true,
          recipient_kind: 'approved_vendor',
          recipient_name: 'Northline Sign Co.',
        }),
      ],
      BRAND,
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ fulfilledBy: 'Signage.com', external: false });
    expect(sections[1]).toMatchObject({ fulfilledBy: 'Northline Sign Co.', external: true });
  });

  it('ignores an id in a package that has no matching item', () => {
    const sections = toQuoteSections([STOREFRONT], [quote('q1', ['li_store', 'li_gone'])], BRAND);
    expect(sections[0].lines).toHaveLength(1);
  });

  it('counts a standin line as custom rather than pricing it at zero', () => {
    const sections = toQuoteSections([PYLON], [quote('q1', ['li_pylon'])], BRAND);
    expect(sections[0].subtotal).toBe(0);
    expect(sections[0].customLines).toBe(1);
  });
});

describe('fulfillerFor', () => {
  it('names Signage.com on the internal tail whatever the recipient says', () => {
    expect(fulfillerFor(quote('q1', [], { recipient_name: 'Ignore me' }), BRAND)).toBe(
      'Signage.com',
    );
  });

  it('uses the name captured at send time, which a later contact edit cannot move', () => {
    const sent = quote('q1', [], { external: true, recipient_name: 'Northline Sign Co.' });
    expect(fulfillerFor(sent, { vendor_name: 'Renamed Vendor LLC' })).toBe('Northline Sign Co.');
  });

  it('falls back to the brand vendor when no name was captured', () => {
    expect(fulfillerFor(quote('q1', [], { external: true }), BRAND)).toBe('Northline Sign Co.');
  });
});

describe('unpricedItems', () => {
  it('separates declined from still-in-review, which mean opposite things', () => {
    const pending = item('li_pending', 'Awning Graphic', '1200.00', {
      item_status: 'pending_review',
    });
    const declined = item('li_dead', 'Roof Sign', '5000.00', { item_status: 'declined' });

    expect(unpricedItems([STOREFRONT, pending, declined], [quote('q1', ['li_store'])])).toEqual({
      pending: 1,
      declined: 1,
    });
  });

  it('reports nothing outstanding when every item is in a package', () => {
    expect(unpricedItems([STOREFRONT, LOBBY], [quote('q1', ['li_store', 'li_lobby'])])).toEqual({
      pending: 0,
      declined: 0,
    });
  });
});

describe('quoteTotals', () => {
  it('sums across every package, because the lender funds the whole site', () => {
    const sections = toQuoteSections(
      [STOREFRONT, LOBBY, PYLON],
      [
        quote('q1', ['li_store', 'li_lobby']),
        quote('q2', ['li_pylon'], { external: true, recipient_name: 'Northline Sign Co.' }),
      ],
      BRAND,
    );

    expect(quoteTotals(sections)).toEqual({ priced: 8400 + 2900, customLines: 1 });
  });

  it('never folds a custom item into the priced total', () => {
    const sections = toQuoteSections(
      [STOREFRONT, PYLON],
      [quote('q1', ['li_store', 'li_pylon'])],
      BRAND,
    );
    expect(quoteTotals(sections).priced).toBe(8400);
  });

  it('leaves a declined item out of the total entirely', () => {
    // The item exists on the request and carries a price; it is not in the
    // package, so it is not money anyone is being asked to lend.
    const declined = item('li_dead', 'Roof Sign', '5000.00', { item_status: 'declined' });
    const sections = toQuoteSections([STOREFRONT, declined], [quote('q1', ['li_store'])], BRAND);

    expect(quoteTotals(sections).priced).toBe(8400);
  });
});
