import { describe, expect, it } from 'vitest';

import { attributeLabel, signStatus, summarize } from '../manage';

describe('catalog helpers (SPEC v2.4 §2.3)', () => {
  it("starts a proposal's spec line from its locked choices, in order", () => {
    expect(summarize({ mounting_type: 'Standard Raceway', paint_finish: 'Gloss/Satin' })).toBe(
      'Standard Raceway · Gloss/Satin',
    );
    expect(summarize({})).toBeNull();
    // A yes/no flag says nothing on its own in a spec line.
    expect(summarize({ ul_mandatory: true })).toBeNull();
  });

  it('labels an attribute for people', () => {
    expect(attributeLabel('mounting_type')).toBe('Mounting type');
  });

  it('reads a sign as pending, declined, live or retired', () => {
    expect(signStatus({ review_status: 'pending', active: false }).label).toBe('Awaiting review');
    expect(signStatus({ review_status: 'declined', active: false }).label).toBe('Declined');
    expect(signStatus({ review_status: 'approved', active: true }).label).toBe('Live');
    expect(signStatus({ review_status: 'approved', active: false }).label).toBe('Retired');
  });
});
