// The signage number, and the one place it is computed (SPEC §8b).
//
// Three surfaces now quote a brand's standard-package figure: the budget
// one-pager PDF, the §8d welcome email, and the level-1 landing page that email
// links to. A franchisee reads at least two of them side by side and forwards
// one to a lender, so they must not merely happen to agree — they have to be
// the same arithmetic. The functions the one-pager already used moved here for
// that reason, and it re-exports them so nothing that referenced them moved.
//
// `DocumentLine` is imported as a type only: this module is reached from an
// email template and a Server Component, and neither should drag
// @react-pdf/renderer into its graph for the shape of an object.

import { getPackagesForBrand, type BrandItemRow } from './db/queries';
import type { DocumentLine } from './pdf/letterhead';
import type { LocationFormat } from './status/types';

export const FORMAT_LABEL: Record<LocationFormat, string> = {
  inline: 'Inline',
  endcap: 'Endcap',
  freestanding: 'Freestanding',
};

/**
 * Collapse a package's item list into quantity lines.
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

export interface FormatBudget extends BudgetTotals {
  format: LocationFormat;
  /** 'Inline' — the format, for a reader who has never met the enum. */
  formatLabel: string;
  /** The package's own label, e.g. "Corner unit, two elevations". */
  packageLabel: string;
  /** Distinct lines, not sign count: two storefront sets are one line of two. */
  lineCount: number;
}

/**
 * Every format this brand can put a number against.
 *
 * Formats come from `brand_packages`, so a brand with no freestanding package
 * simply has no freestanding row — the same rule the export panel follows, and
 * for the same reason: a missing number must be absent, never zero.
 *
 * At agreement signing the franchisee's format is genuinely unknown — that is
 * what a candidate site decides — so every surface built on this shows all of
 * them rather than guessing one.
 */
export async function budgetByFormat(brandId: string): Promise<FormatBudget[]> {
  const packages = await getPackagesForBrand(brandId);
  return packages
    .filter((pkg) => pkg.items.length > 0)
    .map((pkg) => {
      const lines = toQuantityLines(pkg.items);
      return {
        format: pkg.format,
        formatLabel: FORMAT_LABEL[pkg.format] ?? pkg.format,
        packageLabel: pkg.label,
        lineCount: lines.length,
        ...totalsFor(lines),
      };
    });
}

/** `$11,300` — whole dollars, because a planning figure with cents is a lie about its precision. */
export function budgetMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
