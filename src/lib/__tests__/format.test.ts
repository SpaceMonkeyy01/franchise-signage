import { describe, expect, it } from 'vitest';

import { storeName } from '../format';

describe('storeName', () => {
  it('drops the brand prefix, whatever the separator', () => {
    expect(storeName('Freshbites — Oak Plaza', 'Freshbites')).toBe('Oak Plaza');
    expect(storeName('Freshbites - Lalaland', 'Freshbites')).toBe('Lalaland');
    expect(storeName('freshbites: Riverside', 'Freshbites')).toBe('Riverside');
  });

  it('leaves a name without the prefix alone', () => {
    expect(storeName('Oak Plaza', 'Freshbites')).toBe('Oak Plaza');
    expect(storeName('Freshbites Plaza', 'Freshbites')).toBe('Freshbites Plaza');
  });

  it('never returns an empty name', () => {
    expect(storeName('Freshbites —', 'Freshbites')).toBe('Freshbites —');
  });
});
