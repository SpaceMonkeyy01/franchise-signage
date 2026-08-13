// completed → installed_signs (SPEC §6). The only transition that writes the
// permanent location record, and the reason every later request is a lookup.

import { describe, expect, it } from 'vitest';

import { transitionRequest } from '../transition';
import { planInstalledSignWriteback } from '../writeback';
import { createMemoryStore, lineItem, request } from './memory-store';
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

describe('the completed transition applies the writeback', () => {
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
      tail: 'internal',
    });

    const result = await transitionRequest(store, {
      requestId: 'REQ-0017',
      to: 'completed',
      actor: 'team',
      kind: 'installed',
      summary: 'Marked installed — location record updated',
    });

    expect(store.request.status).toBe('completed');
    expect(store.installedSigns).toHaveLength(2);
    expect(store.installedSigns.find((s) => s.id === 'sign-505')).toMatchObject({
      sizing: '3 panels',
      mockupFileId: 'file-menu-new',
      status: 'active',
    });
    expect(result.writeback?.operations).toHaveLength(1);
    expect(store.events).toHaveLength(1);
  });

  it('adds the new location’s signs on an initial setup', async () => {
    const store = createMemoryStore({
      request: request({ status: 'shipped', locationId: 'LOC-0008' }),
      lineItems: [
        lineItem({ id: '911', brandItemId: 'fb_storefront', sizing: `18' frontage` }),
        lineItem({ id: '915', brandItemId: 'fb_neon', origin: 'addon', itemStatus: 'approved' }),
        lineItem({ id: '916', brandItemId: 'fb_blade', origin: 'addon', itemStatus: 'declined' }),
      ],
      installedSigns: [],
      tail: 'internal',
    });

    await transitionRequest(store, {
      requestId: 'REQ-0016',
      to: 'completed',
      actor: 'team',
      kind: 'installed',
      summary: 'Marked installed — location record updated',
    });

    expect(store.installedSigns.map((s) => s.brandItemId)).toEqual(['fb_storefront', 'fb_neon']);
  });

  it('does not touch the location record on any other transition', async () => {
    const store = createMemoryStore({
      request: request({ status: 'accepted', locationId: OAK_PLAZA }),
      lineItems: [lineItem({ id: 'a', brandItemId: 'fb_storefront' })],
      installedSigns,
      tail: 'internal',
    });

    await transitionRequest(store, {
      requestId: 'REQ-0016',
      to: 'in_production',
      actor: 'team',
      kind: 'production_started',
      summary: 'Production started',
    });

    expect(store.installedSigns).toHaveLength(2);
  });
});
