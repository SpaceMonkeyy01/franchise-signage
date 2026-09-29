// The store card's setup tracker reads the request status (SPEC §6) as a
// franchisee's six stages. Pinned: every live status lands on a stage, the
// franchisee's own moves carry a button, and it steps aside once installed.

import { describe, expect, it } from 'vitest';

import { openingLine, SETUP_STAGES, setupProgress } from '../setup-progress';
import type { RequestStatus } from '../status/types';

describe('setupProgress', () => {
  it('walks the six stages in order as the request moves', () => {
    const order: [RequestStatus, number][] = [
      ['submitted', 1],
      ['needs_review', 1],
      ['changes_requested', 1],
      ['approved', 2],
      ['sent_for_quote', 2],
      ['quote_ready', 2],
      ['accepted', 3],
      ['in_production', 3],
      ['shipped', 4],
    ];
    for (const [status, stage] of order) {
      expect(setupProgress(status)?.current, status).toBe(stage);
    }
    expect(SETUP_STAGES).toHaveLength(6);
  });

  it('offers a button only when the move is the franchisee’s', () => {
    expect(setupProgress('quote_ready')?.action).toBe('Review your quote');
    expect(setupProgress('changes_requested')?.action).toBe('Update the flagged items');
    expect(setupProgress('needs_review')?.action).toBeNull();
    expect(setupProgress('in_production')?.action).toBeNull();
  });

  it('steps aside once installed, and before anything is submitted', () => {
    expect(setupProgress('completed')).toBeNull();
    expect(setupProgress('draft')).toBeNull();
  });
});

describe('openingLine', () => {
  const today = new Date(2026, 8, 29); // 29 Sep 2026, local

  it('counts the days to opening', () => {
    expect(openingLine('2026-10-01', today)).toBe('Opens Oct 1 · in 2 days');
    expect(openingLine('2026-09-30', today)).toBe('Opens Sep 30 · in 1 day');
    expect(openingLine('2026-09-29', today)).toBe('Opens today, Sep 29');
  });

  it('reads the Date pg hands over for a date column', () => {
    expect(openingLine(new Date(2026, 9, 1), today)).toBe('Opens Oct 1 · in 2 days');
  });

  it('says when a store already opened, and nothing with no date', () => {
    expect(openingLine('2026-09-15', today)).toBe('Opened Sep 15');
    expect(openingLine(null, today)).toBeNull();
  });
});
