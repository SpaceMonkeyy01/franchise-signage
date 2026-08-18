// The seed data checked against the taxonomy it pins, without a database.
//
// These are the failures that would otherwise surface as a broken demo: a brand
// item pinned to a taxonomy row that does not exist, a package naming an item
// that was renamed, or a price on an item the pricing engine cannot actually
// quote.

import { describe, expect, it } from 'vitest';

import { brand, brandItems, oakPlaza, cedarPark, packages, vendorContacts } from './freshbites';
import { masterKey, parseTaxonomy } from './taxonomy';

const taxonomy = parseTaxonomy();
const byKey = new Map(taxonomy.map((row) => [masterKey(row), row]));
const itemNames = new Set(brandItems.map((item) => item.name));

describe('sign-taxonomy.tsv', () => {
  it('parses every leaf row', () => {
    // docs/TAXONOMY-NOTES.md: 77 leaves, six of them variant-less.
    expect(taxonomy).toHaveLength(77);
    expect(taxonomy.filter((row) => row.variant === null)).toHaveLength(6);
  });

  it('splits pricing_basis the way the notes describe', () => {
    expect(taxonomy.filter((r) => r.pricing_basis === 'direct')).toHaveLength(50);
    expect(taxonomy.filter((r) => r.pricing_basis === 'standin')).toHaveLength(27);
  });

  it('attaches the attribute matrix by pricing model', () => {
    const storefront = byKey.get(
      masterKey({
        placement: 'outdoor',
        sign_type: 'Illuminated Channel Letters',
        variant: 'Face Lit (Premium Channel Letters)',
      }),
    );
    expect(storefront?.attribute_options).toHaveProperty('mounting_type');
  });

  it('does not rely on source_id being unique — it is not', () => {
    const ids = taxonomy.map((r) => r.source_id).filter((id): id is number => id !== null);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });
});

describe('Freshbites brand items', () => {
  it.each(brandItems.map((item) => [item.name, item] as const))(
    '%s pins a real taxonomy row',
    (_name, item) => {
      const [placement, sign_type, variant] = item.master;
      expect(byKey.get(masterKey({ placement, sign_type, variant }))).toBeDefined();
    },
  );

  it('prices exactly the items whose pinned row has a real pricing model', () => {
    for (const item of brandItems) {
      const [placement, sign_type, variant] = item.master;
      const row = byKey.get(masterKey({ placement, sign_type, variant }))!;
      const priced = item.est_price !== null;
      expect(
        priced,
        `${item.name} is ${priced ? 'priced' : 'unpriced'} but its master row is ${row.pricing_basis}`,
      ).toBe(row.pricing_basis === 'direct');
    }
  });

  it('routes the pylon away from the brand default (SPEC §4)', () => {
    const pylon = brandItems.find((i) => i.name === 'Freshbites Road Sign');
    expect(pylon?.vendor_policy_override).toBe('approved_vendor');
    expect(brandItems.filter((i) => i.vendor_policy_override !== null)).toHaveLength(1);
  });

  it('matches the demo: ten items', () => {
    expect(brandItems).toHaveLength(10);
    expect(new Set(brandItems.map((i) => i.demoMasterId)).size).toBe(10);
  });
});

describe('Freshbites vendor contacts (DECISIONS #20)', () => {
  it('gives the pylon’s policy an address that is not the brand’s own vendor', () => {
    const approved = vendorContacts.find((c) => c.policy === 'approved_vendor');
    expect(approved).toBeDefined();
    // The whole point: the split package goes to a different company. If these
    // ever match, routing is mailing both packages to one recipient again.
    expect(approved!.vendor_email).not.toBe(brand.vendor_email);
  });

  it('leaves the brand’s own policy to the brand columns', () => {
    // signage_com is Freshbites' vendor_policy, so it must resolve through
    // brands.vendor_email — the fallback path a pre-existing brand relies on.
    expect(vendorContacts.some((c) => c.policy === brand.vendor_policy)).toBe(false);
  });

  it('has one contact per policy', () => {
    expect(new Set(vendorContacts.map((c) => c.policy)).size).toBe(vendorContacts.length);
  });
});

describe('Freshbites packages', () => {
  it('covers the three location formats', () => {
    expect(packages.map((p) => p.format)).toEqual(['inline', 'endcap', 'freestanding']);
  });

  it('only names brand items that exist', () => {
    for (const pkg of packages) {
      for (const name of pkg.items) {
        expect(itemNames, `${pkg.format} package`).toContain(name);
      }
    }
  });

  it('keeps the endcap’s duplicate storefront letters — two elevations', () => {
    const endcap = packages.find((p) => p.format === 'endcap')!;
    const storefronts = endcap.items.filter((n) => n === 'Freshbites Storefront Letters');
    expect(storefronts).toHaveLength(2);
  });
});

describe('seed locations', () => {
  it('gives Oak Plaza the five installed signs the fast lane reads from', () => {
    expect(oakPlaza.installedSigns).toHaveLength(5);
    for (const sign of oakPlaza.installedSigns) {
      expect(itemNames).toContain(sign.brandItem);
    }
  });

  it('leaves Cedar Park empty — it has not opened yet', () => {
    expect(cedarPark.installedSigns).toHaveLength(0);
  });
});
