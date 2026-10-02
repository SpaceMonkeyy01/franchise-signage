import { describe, expect, it } from 'vitest';

import { parseMarginInput, priceFromCost, resolveMargin, type MarginRow } from '../margin';

const ROWS: MarginRow[] = [
  { brand_id: null, sign_type: null, margin_percent: '40.00' },
  { brand_id: 'fresh', sign_type: null, margin_percent: '35.00' },
  { brand_id: 'fresh', sign_type: 'Illuminated Channel Letters', margin_percent: '30.00' },
];

describe('margins (SPEC v2.6 §8)', () => {
  it('uses the brand and sign type first, then the brand, then the platform', () => {
    expect(resolveMargin(ROWS, 'fresh', 'Illuminated Channel Letters')).toEqual({ percent: 30, source: 'sign_type' });
    expect(resolveMargin(ROWS, 'fresh', 'Pylon Signs')).toEqual({ percent: 35, source: 'brand' });
    expect(resolveMargin(ROWS, 'other', 'Illuminated Channel Letters')).toEqual({ percent: 40, source: 'platform' });
  });

  it('falls back to 40% if even the platform default is missing', () => {
    expect(resolveMargin([], 'fresh', 'Pylon Signs')).toEqual({ percent: 40, source: 'platform' });
  });

  it('is a margin on the price, as Signize defines it, not a markup on the cost', () => {
    expect(priceFromCost(600, 40)).toBe(1000);
    expect(priceFromCost(310, 40)).toBe(517);
    expect(priceFromCost(310, 0)).toBe(310);
  });

  it('has no price without a cost, and refuses an impossible margin', () => {
    expect(priceFromCost(0, 40)).toBeNull();
    expect(priceFromCost(Number.NaN, 40)).toBeNull();
    expect(() => priceFromCost(100, 100)).toThrow(RangeError);
    expect(() => priceFromCost(100, -1)).toThrow(RangeError);
  });

  it('reads what the team types', () => {
    expect(parseMarginInput('40')).toBe(40);
    expect(parseMarginInput(' 37.5% ')).toBe(37.5);
    expect(parseMarginInput('')).toBeNull();
    expect(() => parseMarginInput('100')).toThrow(RangeError);
    expect(() => parseMarginInput('abc')).toThrow(RangeError);
  });
});
