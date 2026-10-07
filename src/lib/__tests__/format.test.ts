import { describe, expect, it } from 'vitest';

import { signKind, storeName } from '../format';

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

describe('signKind', () => {
  it('adds the variant, without repeating the type', () => {
    expect(signKind('Illuminated Channel Letters', 'Face Lit (Premium Channel Letters)')).toBe(
      'Illuminated Channel Letters · Face Lit (Premium)',
    );
    expect(signKind('Illuminated Channel Letters', 'Face-Lit (Standard Channel Letter)')).toBe(
      'Illuminated Channel Letters · Face-Lit (Standard)',
    );
    expect(signKind('Illuminated Dimensional Letters', 'Halo-Lit (Back-lit)')).toBe(
      'Illuminated Dimensional Letters · Halo-Lit (Back-lit)',
    );
  });

  it('is just the type with no variant', () => {
    expect(signKind('A-Frame Sign', null)).toBe('A-Frame Sign');
    expect(signKind('A-Frame Sign', '  ')).toBe('A-Frame Sign');
  });
});
