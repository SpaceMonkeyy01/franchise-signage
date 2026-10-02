// Signage.com's price from the Design Studio engine's cost (SPEC v2.6 §8).
//
// The engine returns Signize's cost. Signage.com's price carries a MARGIN —
// a share of the price, as Signize's own estimates define it — so
// price = cost / (1 - margin). A 40% margin on a $600 cost is a $1,000 price.
// Pure, so the same rule prices a screen, a submission and a test.

export interface MarginRow {
  brand_id: string | null;
  sign_type: string | null;
  margin_percent: number | string;
}

export type MarginSource = 'sign_type' | 'brand' | 'platform';

export interface ResolvedMargin {
  percent: number;
  source: MarginSource;
}

/** Used only if the platform default row is missing; the migration seeds it at the same value. */
export const FALLBACK_MARGIN_PERCENT = 40;

/** The most specific margin set: brand and sign type, then the brand's default, then the platform's. */
export function resolveMargin(
  rows: readonly MarginRow[],
  brandId: string,
  signType: string,
): ResolvedMargin {
  const find = (brand: string | null, type: string | null) =>
    rows.find((row) => row.brand_id === brand && row.sign_type === type);
  const exact = find(brandId, signType);
  if (exact) return { percent: Number(exact.margin_percent), source: 'sign_type' };
  const brand = find(brandId, null);
  if (brand) return { percent: Number(brand.margin_percent), source: 'brand' };
  const platform = find(null, null);
  return { percent: platform ? Number(platform.margin_percent) : FALLBACK_MARGIN_PERCENT, source: 'platform' };
}

/** Signage.com's price for a cost, rounded to whole dollars; null when there is no usable cost. */
export function priceFromCost(cost: number, marginPercent: number): number | null {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    throw new RangeError(`A margin must be at least 0% and under 100%; got ${marginPercent}.`);
  }
  return Math.round(cost / (1 - marginPercent / 100));
}

/** Parse what the team typed: "40", "40%", " 37.5 ". Null for empty (= use the default beneath). */
export function parseMarginInput(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value >= 100) {
    throw new RangeError('Enter a margin from 0 to 99.99 percent.');
  }
  return Math.round(value * 100) / 100;
}
