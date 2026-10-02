import { describe, expect, it } from 'vitest';

import { parseDate } from '../create-request';

describe('target opening dates, typed free-hand', () => {
  it('keeps the calendar date in a zone ahead of UTC (Jan 15 stayed Jan 15)', () => {
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Karachi';
    try {
      expect(parseDate('Jan 15, 2027')).toBe('2027-01-15');
      expect(parseDate('October 1, 2026')).toBe('2026-10-01');
    } finally {
      process.env.TZ = before;
    }
  });

  it('keeps an ISO date exactly, and drops what it cannot read', () => {
    expect(parseDate('2027-01-15')).toBe('2027-01-15');
    expect(parseDate('spring')).toBeNull();
    expect(parseDate('  ')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});
