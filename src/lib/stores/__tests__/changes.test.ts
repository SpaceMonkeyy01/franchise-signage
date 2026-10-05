import { describe, expect, it } from 'vitest';

import { mayChangeType, storeChanges, type StoreFields } from '../changes';

const base: StoreFields = {
  name: 'Freshbites — Oak Plaza',
  line1: '88 Oak Plaza Dr',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  openingDate: '2026-09-15',
  format: 'inline',
};
const label = (key: string) => ({ inline: 'Inline', endcap: 'Endcap' })[key] ?? key;

describe('storeChanges', () => {
  it('reports nothing when nothing changed, ignoring stray spaces', () => {
    expect(storeChanges(base, { ...base, name: ` ${base.name} ` }, label)).toEqual([]);
  });

  it('names each change, with the store type by its label', () => {
    const changes = storeChanges(base, { ...base, city: 'Round Rock', format: 'endcap', openingDate: '' }, label);
    expect(changes.map((c) => c.summary)).toEqual([
      'Address changed to 88 Oak Plaza Dr, Round Rock, TX, 78701',
      'Opening date cleared',
      'Store type changed from Inline to Endcap',
    ]);
  });
});

describe('mayChangeType', () => {
  it('lets an owner change the store type only before the first order', () => {
    expect(mayChangeType(false, false)).toBe(true);
    expect(mayChangeType(true, false)).toBe(false);
  });

  it('lets Signage.com change it at any time', () => {
    expect(mayChangeType(true, true)).toBe(true);
  });
});
