// completed → installed_signs (SPEC §6). The only transition that writes the
// permanent location record, and the reason every later request is a lookup.
//
// Amended v2.2: it is the PACKAGE's completed, and it writes only that package's
// items. On a §4 split that matters — Signage.com's signs go on the record when
// Signage.com installs them, not when a vendor weeks behind finally reports in.

import { describe, expect, it } from 'vitest';

import { transitionPackage, transitionRequest } from '../transition';
import { planInstalledSignWriteback } from '../writeback';
import { createMemoryStore, lineItem, pkg, request } from './memory-store';
import type { InstalledSignState } from '../types';

const OAK_PLAZA = 'LOC-0007';

// The Oak Plaza record from docs/flow-demo.jsx.
const installedSigns: InstalledSignState[] = [
  {
    id: 'sign-501',
    locationId: OAK_PLAZA,
    brandItemId: 'fb_storefront',
    sizing: `22' frontage · 30" letters`,
    mockupFileId: 'file-storefront',
    status: 'active',
  },
  {
    id: 'sign-505',
    locationId: OAK_PLAZA,
    brandItemId: 'fb_menu',
    sizing: '3 panels',
    mockupFileId: 'file-menu-old',
    status: 'active',
  },
];

describe('planInstalledSignWriteback', () => {
  it('inserts a row per approved item on a new location', () => {
    const plan = planInstalledSignWriteback(
      { locationId: 'LOC-0008' },
      [
        lineItem({ id: 'a', brandItemId: 'fb_storefront', sizing: `18' frontage` }),
        lineItem({ id: 'b', brandItemId: 'fb_window', sizing: '3 panes' }),
      ],
      [],
    );

    expect(plan.operations).toEqual([
      expect.objectContaining({ kind: 'insert', brandItemId: 'fb_storefront', sourceLineItemId: 'a' }),
      expect.objectContaining({ kind: 'insert', brandItemId: 'fb_window', sourceLineItemId: 'b' }),
    ]);
    expect(plan.skipped).toHaveLength(0);
  });

  it('upserts a replacement in place instead of duplicating the sign', () => {
    const plan = planInstalledSignWriteback(
      { locationId: OAK_PLAZA },
      [
        lineItem({
          id: 'item-917',
          brandItemId: 'fb_menu',
          origin: 'replacement',
          replacesSignId: 'sign-505',
          sizing: '3 panels',
          mockupFileId: 'file-menu-new',
        }),
      ],
      installedSigns,
    );

    expect(plan.operations).toEqual([
      {
        kind: 'update',
        installedSignId: 'sign-505',
        sizing: '3 panels',
        mockupFileId: 'file-menu-new',
        sourceLineItemId: 'item-917',
      },
    ]);
  });

  it('keeps the installed record’s specs when the replacement did not restate them', () => {
    const plan = planInstalledSignWriteback(
      { locationId: OAK_PLAZA },
      [
        lineItem({
          id: 'item-917',
          brandItemId: 'fb_menu',
          origin: 'replacement',
          replacesSignId: 'sign-505',
          sizing: null,
          mockupFileId: null,
        }),
      ],
      installedSigns,
    );

    expect(plan.operations[0]).toMatchObject({
      kind: 'update',
      sizing: '3 panels',
      mockupFileId: 'file-menu-old',
    });
  });

  it('writes nothing for a declined item, and everything for its siblings', () => {
    const plan = planInstalledSignWriteback(
      { locationId: 'LOC-0008' },
      [
        lineItem({ id: 'a', brandItemId: 'fb_storefront' }),
        lineItem({ id: 'b', brandItemId: 'fb_neon', origin: 'addon', itemStatus: 'declined' }),
        lineItem({ id: 'c', brandItemId: 'fb_lobby', itemStatus: 'approved' }),
      ],
      [],
    );

    expect(plan.operations.map((o) => o.sourceLineItemId)).toEqual(['a', 'c']);
    expect(plan.skipped).toEqual([{ lineItemId: 'b', reason: 'declined' }]);
  });

  it('refuses to duplicate when the replacement target is not on the location', () => {
    const plan = planInstalledSignWriteback(
      { locationId: OAK_PLAZA },
      [
        lineItem({
          id: 'item-917',
          origin: 'replacement',
          replacesSignId: 'sign-999',
        }),
      ],
      installedSigns,
    );

    expect(plan.operations).toHaveLength(0);
    expect(plan.skipped).toEqual([{ lineItemId: 'item-917', reason: 'missing_target' }]);
  });
});

describe('a package reaching completed applies the writeback', () => {
  const shippedInternal = (id: string, lineItemIds: string[]) =>
    pkg({
      id,
      lineItemIds,
      acceptedAt: new Date('2026-08-02T12:00:00Z'),
      inProductionAt: new Date('2026-08-03T12:00:00Z'),
      shippedAt: new Date('2026-08-04T12:00:00Z'),
    });

  it('updates Oak Plaza’s menu board rather than adding a second one', async () => {
    const store = createMemoryStore({
      request: request({
        id: 'REQ-0017',
        locationId: OAK_PLAZA,
        intent: 'replace_like',
        status: 'shipped',
      }),
      lineItems: [
        lineItem({
          id: 'item-917',
          brandItemId: 'fb_menu',
          origin: 'replacement',
          replacesSignId: 'sign-505',
          sizing: '3 panels',
          mockupFileId: 'file-menu-new',
        }),
      ],
      installedSigns,
      packages: [shippedInternal('pkg-internal', ['item-917'])],
    });

    const result = await transitionPackage(store, {
      requestId: 'REQ-0017',
      quoteId: 'pkg-internal',
      to: 'completed',
      actor: 'team',
      kind: 'installed',
    });

    expect(store.request.status).toBe('completed');
    expect(store.installedSigns).toHaveLength(2);
    expect(store.installedSigns.find((s) => s.id === 'sign-505')).toMatchObject({
      sizing: '3 panels',
      mockupFileId: 'file-menu-new',
      status: 'active',
    });
    expect(result.writeback?.operations).toHaveLength(1);
    // Two events: the package moved, and the request followed it up.
    expect(store.events).toHaveLength(2);
  });

  it('adds the new location’s signs on an initial setup', async () => {
    const store = createMemoryStore({
      request: request({ status: 'shipped', locationId: 'LOC-0008' }),
      lineItems: [
        lineItem({ id: '911', brandItemId: 'fb_storefront', sizing: '18ft frontage' }),
        lineItem({ id: '915', brandItemId: 'fb_neon', origin: 'addon', itemStatus: 'approved' }),
        lineItem({ id: '916', brandItemId: 'fb_blade', origin: 'addon', itemStatus: 'declined' }),
      ],
      installedSigns: [],
      packages: [shippedInternal('pkg-internal', ['911', '915', '916'])],
    });

    await transitionPackage(store, {
      requestId: 'REQ-0016',
      quoteId: 'pkg-internal',
      to: 'completed',
      actor: 'team',
    });

    expect(store.installedSigns.map((s) => s.brandItemId)).toEqual(['fb_storefront', 'fb_neon']);
  });

  it('writes only its OWN items — the other half of a split is not up yet', async () => {
    // The seeded §4 split: the pylon routes to the brand's approved vendor and
    // the rest stays with Signage.com. Installing our half must not put the
    // vendor's sign on the location record on the vendor's behalf.
    //
    // The request sits at `accepted` even though our package has shipped, and
    // that IS the rollup: the least advanced package is the vendor's.
    const store = createMemoryStore({
      request: request({ status: 'accepted', locationId: 'LOC-0008' }),
      lineItems: [
        lineItem({ id: 'ours-1', brandItemId: 'fb_storefront' }),
        lineItem({ id: 'ours-2', brandItemId: 'fb_lobby' }),
        lineItem({ id: 'theirs', brandItemId: 'fb_road', origin: 'addon', itemStatus: 'approved' }),
      ],
      installedSigns: [],
      packages: [
        shippedInternal('pkg-internal', ['ours-1', 'ours-2']),
        pkg({
          id: 'pkg-external',
          recipientName: 'Meridian Sign Co.',
          external: true,
          lineItemIds: ['theirs'],
          acceptedAt: new Date('2026-08-02T12:00:00Z'),
        }),
      ],
    });

    await transitionPackage(store, {
      requestId: 'REQ-0016',
      quoteId: 'pkg-internal',
      to: 'completed',
      actor: 'team',
    });

    expect(store.installedSigns.map((s) => s.brandItemId)).toEqual(['fb_storefront', 'fb_lobby']);
    // And the REQUEST is not completed: the vendor's half is still out there.
    expect(store.request.status).toBe('accepted');

    await transitionPackage(store, {
      requestId: 'REQ-0016',
      quoteId: 'pkg-external',
      to: 'completed',
      actor: 'team',
    });

    expect(store.installedSigns.map((s) => s.brandItemId)).toEqual([
      'fb_storefront',
      'fb_lobby',
      'fb_road',
    ]);
    expect(store.request.status).toBe('completed');
  });

  it('does not touch the location record on any other package move', async () => {
    const store = createMemoryStore({
      request: request({ status: 'accepted', locationId: OAK_PLAZA }),
      lineItems: [lineItem({ id: 'a', brandItemId: 'fb_storefront' })],
      installedSigns,
      packages: [
        pkg({ id: 'pkg-internal', lineItemIds: ['a'], acceptedAt: new Date('2026-08-02T12:00:00Z') }),
      ],
    });

    await transitionPackage(store, {
      requestId: 'REQ-0016',
      quoteId: 'pkg-internal',
      to: 'in_production',
      actor: 'team',
      kind: 'production_started',
    });

    expect(store.installedSigns).toHaveLength(2);
    expect(store.request.status).toBe('in_production');
  });

  it('still refuses an out-of-order request transition', async () => {
    const store = createMemoryStore({
      request: request({ status: 'submitted' }),
      lineItems: [lineItem({ id: 'a' })],
    });
    await expect(
      transitionRequest(store, { requestId: 'REQ-0016', to: 'completed', actor: 'team' }),
    ).rejects.toThrow(/Illegal request transition/);
  });
});
