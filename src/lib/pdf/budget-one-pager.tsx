// The budget one-pager (SPEC §8b, promoted to MVP Aug 2026).
//
// Moment A of the two the spec identifies: before any site exists, during
// franchise sales and loan pre-qualification, when the franchisee needs a
// signage number for a business plan and no request — and no location — exists
// yet. Moment B is the DID plus budgetary quote, once a candidate site is at
// LOI. This document must not be confused with that one, which is why it says
// what it is three times: in the type, in the purpose block, and in the footer.
//
// Built entirely from `brand_packages` + `brand_items`, so it is available for
// any brand the moment the seed runs. Nothing about it is per-franchisee, which
// is the point: corporate hands the same sheet to every candidate.
//
// One page, per SPEC §8b. The Freshbites packages run to five or six lines, so
// the layout has room; a brand with a thirty-item package would overflow, and
// that is a real limit worth knowing rather than papering over with pagination
// that would break the "one page" contract.

import { Text, View } from '@react-pdf/renderer';

import type { BrandItemRow, PackageRow } from '../db/queries';
import {
  DocumentShell,
  LineTable,
  pdfMoneyRound,
  styles,
  type DocumentLine,
  type PdfBrand,
} from './letterhead';

const FORMAT_LABEL: Record<string, string> = {
  inline: 'Inline',
  endcap: 'Endcap',
  freestanding: 'Freestanding',
};

export interface BudgetOnePagerProps {
  brand: PdfBrand;
  pkg: PackageRow;
  issuedAt: Date;
}

/**
 * Collapse the package's item list into quantity lines.
 *
 * `brand_packages.items` repeats an id when a format needs the item more than
 * once — an endcap takes two storefront sets because it has two elevations
 * (SPEC §3.2) — so the repetition carries the quantity and must be counted, not
 * deduplicated. Order follows first appearance, which is the catalog's
 * `sort_order`, so the sheet reads outside-in the way the packages are written.
 */
export function toQuantityLines(items: BrandItemRow[]): DocumentLine[] {
  const byId = new Map<string, DocumentLine>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (existing) {
      existing.quantity += 1;
      continue;
    }
    byId.set(item.id, {
      name: item.name,
      detail: item.spec_summary,
      quantity: 1,
      unitPrice: item.est_price === null ? null : Number(item.est_price),
    });
  }
  return [...byId.values()];
}

export interface BudgetTotals {
  /** Summed est_price × quantity across direct-priced lines only. */
  priced: number;
  /** How many DISTINCT lines carry no estimate and are quoted separately. */
  customLines: number;
}

export function totalsFor(lines: DocumentLine[]): BudgetTotals {
  return lines.reduce<BudgetTotals>(
    (acc, line) => {
      if (line.unitPrice === null) return { ...acc, customLines: acc.customLines + 1 };
      return { ...acc, priced: acc.priced + line.unitPrice * line.quantity };
    },
    { priced: 0, customLines: 0 },
  );
}

export function BudgetOnePager({ brand, pkg, issuedAt }: BudgetOnePagerProps) {
  const lines = toQuantityLines(pkg.items);
  const totals = totalsFor(lines);
  const formatLabel = FORMAT_LABEL[pkg.format] ?? pkg.format;

  return (
    <DocumentShell
      brand={brand}
      documentType="Signage budget"
      reference={`${brand.name} · ${formatLabel} format`}
      issuedAt={issuedAt}
      purpose={`Budget planning figure for the standard ${brand.name} signage package at a ${formatLabel.toLowerCase()} location. For business planning and loan pre-qualification. This is an estimate, not a quote.`}
      disclaimer="Estimate only. Not a quote, a bid, or an offer to contract. Prices are current standard-package estimates and exclude permits, electrical service, freight surcharges, and any landlord or municipal requirements specific to a site. A site-specific quote is issued once a location is identified."
    >
      <View style={{ marginBottom: 14 }}>
        <Text style={styles.sectionTitle}>STANDARD PACKAGE — {formatLabel.toUpperCase()}</Text>
        <Text style={{ fontSize: 10, marginBottom: 2 }}>{pkg.label}</Text>
        {pkg.description && <Text style={styles.tdMuted}>{pkg.description}</Text>}
      </View>

      <LineTable lines={lines} priceHeader="Est. price" round />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          Estimated signage investment
          {totals.customLines > 0 ? ', before custom items' : ''}
        </Text>
        <Text style={styles.totalValue}>{pdfMoneyRound(totals.priced)}</Text>
      </View>

      {/* The spec's own phrasing for this line — "custom items quoted
          separately" — because a total that silently omits them would read as
          the whole number to a lender. */}
      {totals.customLines > 0 && (
        <Text style={styles.note}>
          Plus {totals.customLines} custom {totals.customLines === 1 ? 'item' : 'items'} quoted
          separately. {totals.customLines === 1 ? 'It is' : 'They are'} priced per site because
          size, structure, or municipal limits decide the cost — a pylon or monument sign cannot be
          estimated before a site is known.
        </Text>
      )}

      <View style={{ marginTop: 20 }}>
        <Text style={styles.sectionTitle}>WHAT HAPPENS NEXT</Text>
        <Text style={{ fontSize: 9, lineHeight: 1.6, color: '#374151' }}>
          Once a candidate site is identified, {brand.name} and Signage.com produce a site-specific
          budgetary quote against the actual frontage, elevations, and local sign code — the
          document a lender works from during underwriting. This sheet is for the stage before
          that, when a number is needed and a site is not yet chosen.
        </Text>
      </View>
    </DocumentShell>
  );
}
