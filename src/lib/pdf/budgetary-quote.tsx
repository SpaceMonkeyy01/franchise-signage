// The budgetary quote (SPEC §8b, document 1 of 3).
//
// Moment B of the two §8b identifies: a candidate site is at LOI, the loan is in
// underwriting, and the lender wants a site-specific signage number against the
// actual frontage and elevations. The budget one-pager answered moment A with a
// format-level figure; this answers B with this request, at this address, at the
// prices the team actually put on it.
//
// Everything here is read back from `line_items.est_price_snapshot` — the same
// column the franchisee saw, the reviewer approved and the quote total was
// summed from. It is deliberately not recomputed from `brand_items`: the catalog
// price moves, and a lender document that disagrees with the quote email sent
// the same week is worse than no document (the snapshot column says as much in
// the migration).
//
// Three things this document refuses to do, all for the same reason — a number
// on a lender's desk gets relied on:
//
//   1. Fold custom-quote items into the total. They are counted and named, never
//      guessed at, exactly as the one-pager does.
//   2. Present a split request as one payee. Routing (SPEC §4) can put half a
//      request with Signage.com and half with the brand's approved vendor, who
//      invoices the franchisee directly. The letterhead says Signage.com because
//      Signage.com issues the estimate; each section says who is actually paid.
//   3. Total items corporate has not decided on yet. Only items inside a quote
//      package are priced here; anything still in review is disclosed as a
//      count, so the total cannot read as final when it is not.

import { Text, View } from '@react-pdf/renderer';

import type { LineItemRow, QuoteRow, RequestDetail } from '../db/queries';
import {
  DocumentShell,
  LineTable,
  pdfMoney,
  styles,
  type DocumentLine,
  type PdfBrand,
} from './letterhead';

/** One quote package, rendered as its own priced section. */
export interface QuoteSection {
  quoteId: string;
  /** Who fulfills and invoices this package. */
  fulfilledBy: string;
  /** True → the brand's vendor bills the franchisee; Signage.com does not. */
  external: boolean;
  lines: DocumentLine[];
  /** Summed across priced lines only. */
  subtotal: number;
  /** Lines with no price, awaiting a quote from the fulfiller. */
  customLines: number;
}

/**
 * A line item as one document line.
 *
 * Every line item is its own row with its own site detail, so — unlike the
 * one-pager, where a repeated package entry means quantity — nothing is
 * collapsed here. Two storefront sets on an endcap are two lines because they
 * are two elevations with two different sizings, and a lender comparing this
 * against the vendor's own quote should see the same shape on both.
 */
export function toDocumentLine(item: LineItemRow): DocumentLine {
  const detail = item.sizing ?? item.spec_summary;
  return {
    name: item.brand_item_name,
    // A TBD field means the price can still move, and that belongs on the line
    // rather than only in a footnote a skimming underwriter never reaches.
    detail: item.tbd_fields.length > 0 ? `${detail ? `${detail} · ` : ''}site details TBD` : detail,
    quantity: 1,
    unitPrice: item.est_price_snapshot === null ? null : Number(item.est_price_snapshot),
  };
}

/** Who a package's money goes to, in the words the franchisee already saw. */
export function fulfillerFor(quote: QuoteRow, brand: { vendor_name: string | null }): string {
  if (!quote.external) return 'Signage.com';
  return quote.recipient_name ?? brand.vendor_name ?? 'the brand’s approved vendor';
}

/**
 * Split the request's items into one section per quote package.
 *
 * `quotes.line_item_ids` is the authority on what is in a package, not the item
 * status: it is the set routing actually sent, and it is what the quote total
 * was computed from. An item in no package — declined, or still with corporate —
 * appears in no section, which is what `unpricedItems` below then reports.
 */
export function toQuoteSections(
  items: LineItemRow[],
  quotes: QuoteRow[],
  brand: { vendor_name: string | null },
): QuoteSection[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  return quotes.map((quote) => {
    const lines = quote.line_item_ids
      .map((id) => byId.get(id))
      .filter((item): item is LineItemRow => item !== undefined)
      .map(toDocumentLine);

    return {
      quoteId: quote.id,
      fulfilledBy: fulfillerFor(quote, brand),
      external: quote.external,
      lines,
      subtotal: lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0),
      customLines: lines.filter((line) => line.unitPrice === null).length,
    };
  });
}

/**
 * Items on the request that no package covers.
 *
 * Split by why, because they mean opposite things to a lender: a declined item
 * is off the budget for good, while an item still in review may yet be added to
 * it. Neither is in the total.
 */
export function unpricedItems(
  items: LineItemRow[],
  quotes: QuoteRow[],
): { pending: number; declined: number } {
  const routed = new Set(quotes.flatMap((quote) => quote.line_item_ids));
  let pending = 0;
  let declined = 0;
  for (const item of items) {
    if (routed.has(item.id)) continue;
    if (item.item_status === 'declined') declined += 1;
    else pending += 1;
  }
  return { pending, declined };
}

export interface QuoteTotals {
  priced: number;
  customLines: number;
}

export function quoteTotals(sections: QuoteSection[]): QuoteTotals {
  return sections.reduce<QuoteTotals>(
    (acc, section) => ({
      priced: acc.priced + section.subtotal,
      customLines: acc.customLines + section.customLines,
    }),
    { priced: 0, customLines: 0 },
  );
}

/** The one-line address a lender matches against the lease. */
export function addressLine(request: RequestDetail): string {
  const address = request.location.address ?? {};
  const parts = [address.line1, address.line2, address.city, address.state, address.zip]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(', ');
  return parts === '' ? request.location.name : `${request.location.name} — ${parts}`;
}

export interface BudgetaryQuoteProps {
  brand: PdfBrand & { name: string; vendor_name: string | null };
  request: RequestDetail;
  issuedAt: Date;
}

export function BudgetaryQuote({ brand, request, issuedAt }: BudgetaryQuoteProps) {
  const sections = toQuoteSections(request.items, request.quotes, brand);
  const totals = quoteTotals(sections);
  const unpriced = unpricedItems(request.items, request.quotes);
  const split = sections.length > 1;

  return (
    <DocumentShell
      brand={brand}
      documentType="Budgetary quote"
      reference={`${request.code}${request.package_version > 1 ? ` · v${request.package_version}` : ''}`}
      issuedAt={issuedAt}
      purpose={`Site-specific signage estimate for ${addressLine(request)}. Prepared for loan underwriting and use-of-proceeds budgeting. Budgetary estimate — not a firm bid or an offer to contract.`}
      billedTo={addressLine(request)}
      disclaimer="Budgetary estimate only, priced as of the issue date above. Not a firm bid, a contract, or an offer to contract. Excludes permits, permit-required engineering, electrical service, freight surcharges, and any landlord or municipal requirement specific to this site. Items shown as a custom quote are priced separately once site conditions are known. Signage.com does not warrant that any sign shown here will be permitted or approved."
    >
      {sections.map((section) => (
        <View key={section.quoteId} style={{ marginBottom: split ? 16 : 8 }}>
          {/* The section header only earns its space on a split request; on the
              ordinary single-package one it would be chrome around one table. */}
          {split && (
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.sectionTitle}>
                FULFILLED BY {section.fulfilledBy.toUpperCase()}
              </Text>
              {section.external && (
                <Text style={styles.tdMuted}>
                  Invoiced to the franchisee by {section.fulfilledBy} directly, not by Signage.com.
                </Text>
              )}
            </View>
          )}

          <LineTable lines={section.lines} priceHeader="Price" />

          {split && (
            <View style={{ ...styles.row, justifyContent: 'flex-end', marginTop: 6 }}>
              <Text style={styles.totalLabel}>Subtotal — {section.fulfilledBy}</Text>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>
                {pdfMoney(section.subtotal)}
              </Text>
            </View>
          )}
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          Estimated signage investment
          {totals.customLines > 0 ? ', before custom items' : ''}
        </Text>
        <Text style={styles.totalValue}>{pdfMoney(totals.priced)}</Text>
      </View>

      {totals.customLines > 0 && (
        <Text style={styles.note}>
          Plus {totals.customLines} custom {totals.customLines === 1 ? 'item' : 'items'} quoted
          separately — priced per site because size, structure, or municipal limits decide the cost.
          {totals.customLines === 1 ? ' It is' : ' They are'} not included in the figure above.
        </Text>
      )}

      {unpriced.pending > 0 && (
        <Text style={styles.note}>
          {unpriced.pending} further {unpriced.pending === 1 ? 'item is' : 'items are'} still with{' '}
          {brand.name} for approval and {unpriced.pending === 1 ? 'is' : 'are'} not priced here. If
          approved, {unpriced.pending === 1 ? 'it is' : 'they are'} added to a revised quote.
        </Text>
      )}

      {unpriced.declined > 0 && (
        <Text style={styles.note}>
          {unpriced.declined} {unpriced.declined === 1 ? 'item was' : 'items were'} declined by{' '}
          {brand.name} and {unpriced.declined === 1 ? 'is' : 'are'} excluded from this estimate.
        </Text>
      )}

      {/* Who to pay is the first thing an underwriter looks for, and on a split
          request the letterhead alone answers it wrongly. */}
      {split && (
        <View style={{ marginTop: 18 }}>
          <Text style={styles.sectionTitle}>WHO IS PAID</Text>
          <Text style={{ fontSize: 9, lineHeight: 1.6, color: '#374151' }}>
            This estimate covers signage from more than one supplier.{' '}
            {sections
              .map((section) =>
                section.external
                  ? `${section.fulfilledBy} quotes and invoices its own items directly`
                  : 'Signage.com quotes, fabricates and invoices its items',
              )
              .join('; ')}
            . Disbursement should follow each supplier’s own invoice.
          </Text>
        </View>
      )}
    </DocumentShell>
  );
}
