import { describe, expect, it } from 'vitest';

import { packagesToAutoDeliver } from '../confirmation';

const ours = { quoteId: 'ours', external: false, manualCount: 0 };
const custom = { quoteId: 'custom', external: false, manualCount: 1 };
const vendor = { quoteId: 'vendor', external: true, manualCount: 0 };

describe('packagesToAutoDeliver', () => {
  it('delivers nothing while the team confirms quotes', () => {
    expect(packagesToAutoDeliver(true, [ours, custom, vendor])).toEqual([]);
  });

  it("delivers only Signage.com's fully priced packages when it does not", () => {
    expect(packagesToAutoDeliver(false, [ours, custom, vendor])).toEqual([ours]);
  });
});
