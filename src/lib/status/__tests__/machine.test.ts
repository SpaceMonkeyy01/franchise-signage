// SPEC §6/§7 rules, tested against the storyline docs/flow-demo.jsx tells.

import { describe, expect, it } from 'vitest';

import {
  applyChangeRequest,
  applyResubmission,
  canTransition,
  deriveInitialItemStatus,
  deriveRequestStatus,
  InvalidTransitionError,
  resolveVendorPolicy,
} from '../machine';
import {
  prepPackage,
  requestChanges,
  resubmitRequest,
  submitRequest,
  transitionRequest,
} from '../transition';
import { createMemoryStore, lineItem, request } from './memory-store';
import type { BrandRules } from '../types';

const STANDARD_MODEL: BrandRules = { approvalMode: 'standard_model', vendorPolicy: 'signage_com' };

// ------------------------------------------------------- line-item derivation

describe('deriveInitialItemStatus (SPEC §7)', () => {
  it('auto-approves standard package items — corporate never sees them', () => {
    expect(deriveInitialItemStatus('standard', STANDARD_MODEL)).toBe('auto_approved');
  });

  it('sends add-ons to corporate', () => {
    expect(deriveInitialItemStatus('addon', STANDARD_MODEL)).toBe('pending_review');
  });

  it('honours a brand item that waives review for add-ons', () => {
    expect(
      deriveInitialItemStatus('addon', STANDARD_MODEL, { requiresReviewOverride: false }),
    ).toBe('auto_approved');
  });

  it('always reviews an exception, even on a standard item', () => {
    expect(deriveInitialItemStatus('exception', STANDARD_MODEL)).toBe('pending_review');
  });

  it('always auto-approves a like-for-like replacement (the fast lane)', () => {
    expect(deriveInitialItemStatus('replacement', STANDARD_MODEL)).toBe('auto_approved');
  });

  it('treats approval_mode as the outer switch', () => {
    const never: BrandRules = { ...STANDARD_MODEL, approvalMode: 'never' };
    const always: BrandRules = { ...STANDARD_MODEL, approvalMode: 'always' };
    expect(deriveInitialItemStatus('exception', never)).toBe('auto_approved');
    expect(deriveInitialItemStatus('replacement', always)).toBe('pending_review');
  });
});

describe('deriveRequestStatus (SPEC §6)', () => {
  it('needs_review when any item is pending', () => {
    const derived = deriveRequestStatus([
      lineItem({ id: 'a', itemStatus: 'auto_approved' }),
      lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' }),
    ]);
    expect(derived.status).toBe('needs_review');
    expect(derived.fastLane).toBe(false);
    expect(derived).toMatchObject({ pendingCount: 1, approvedCount: 1 });
  });

  it('skips needs_review entirely when everything auto-approved', () => {
    const derived = deriveRequestStatus([
      lineItem({ id: 'a' }),
      lineItem({ id: 'b', brandItemId: 'fb_window' }),
    ]);
    expect(derived.status).toBe('approved');
    expect(derived.fastLane).toBe(true);
  });

  it('a decline never blocks its siblings', () => {
    const derived = deriveRequestStatus([
      lineItem({ id: 'a', itemStatus: 'approved' }),
      lineItem({ id: 'b', origin: 'addon', itemStatus: 'declined' }),
    ]);
    expect(derived.status).toBe('approved');
    expect(derived.declinedCount).toBe(1);
    // Corporate was involved, so this is not the fast lane even though it
    // ends up in the same state.
    expect(derived.fastLane).toBe(false);
  });

  it('flags an all-declined request rather than inventing a status for it', () => {
    const derived = deriveRequestStatus([lineItem({ id: 'a', itemStatus: 'declined' })]);
    expect(derived.blocked).toBe('all_items_declined');
  });

  it('a pending change request outranks anything still under review', () => {
    const derived = deriveRequestStatus([
      lineItem({ id: 'a', itemStatus: 'changes_requested' }),
      lineItem({ id: 'b', itemStatus: 'pending_review' }),
    ]);
    expect(derived.status).toBe('changes_requested');
  });
});

// ------------------------------------------------------------- the transitions

describe('request transitions (SPEC §6)', () => {
  it('allows the fast lane submitted → approved', () => {
    expect(canTransition('submitted', 'approved')).toBe(true);
  });

  it('rejects skipping the queue', () => {
    expect(canTransition('submitted', 'sent_for_quote')).toBe(false);
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('completed', 'shipped')).toBe(false);
  });

  it('splits the two tails after accepted (SPEC §4)', () => {
    expect(canTransition('accepted', 'in_production', 'internal')).toBe(true);
    expect(canTransition('accepted', 'completed', 'internal')).toBe(false);
    // The external tail's fabrication happens off-platform, so it logs
    // acceptance and lands on installed.
    expect(canTransition('accepted', 'completed', 'external')).toBe(true);
    expect(canTransition('accepted', 'in_production', 'external')).toBe(false);
  });

  it('refuses an illegal transition loudly', async () => {
    const store = createMemoryStore({
      request: request({ status: 'submitted' }),
      lineItems: [lineItem({ id: 'a' })],
    });
    await expect(
      transitionRequest(store, { requestId: 'REQ-0016', to: 'shipped', actor: 'team' }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(store.events).toHaveLength(0);
  });
});

describe('every transition writes an event (CLAUDE.md hard rule)', () => {
  it('records from/to and the actor', async () => {
    const store = createMemoryStore({
      request: request({ status: 'draft' }),
      lineItems: [lineItem({ id: 'a' })],
    });
    await submitRequest(store, 'REQ-0016', 'Initial setup submitted (1 standard)');

    expect(store.request.status).toBe('submitted');
    expect(store.submittedAt).toBeInstanceOf(Date);
    expect(store.events).toEqual([
      expect.objectContaining({
        kind: 'request_submitted',
        actor: 'franchisee',
        fromStatus: 'draft',
        toStatus: 'submitted',
        summary: 'Initial setup submitted (1 standard)',
      }),
    ]);
  });
});

// ------------------------------------------------------------------ fast lane

describe('the fast lane (REQ-0017 in the demo)', () => {
  it('goes submitted → approved in one prep, with no review step', async () => {
    const store = createMemoryStore({
      request: request({ id: 'REQ-0017', locationId: 'LOC-0007', intent: 'replace_like' }),
      lineItems: [
        lineItem({
          id: 'item-917',
          brandItemId: 'fb_menu',
          origin: 'replacement',
          itemStatus: 'auto_approved',
          replacesSignId: 'sign-505',
          sizing: '3 panels',
        }),
      ],
    });

    const result = await prepPackage(store, 'REQ-0017');

    expect(result.from).toBe('submitted');
    expect(result.to).toBe('approved');
    expect(result.derived.fastLane).toBe(true);
    expect(store.events[0]).toMatchObject({
      kind: 'package_prepared',
      summary: 'Package prepared · no review needed',
    });
  });

  it('stops at needs_review when an add-on is present (REQ-0016)', async () => {
    const store = createMemoryStore({
      request: request(),
      lineItems: [
        lineItem({ id: '911', brandItemId: 'fb_storefront' }),
        lineItem({ id: '912', brandItemId: 'fb_window' }),
        lineItem({ id: '913', brandItemId: 'fb_lobby' }),
        lineItem({ id: '914', brandItemId: 'fb_entrance' }),
        lineItem({
          id: '915',
          brandItemId: 'fb_neon',
          origin: 'addon',
          itemStatus: 'pending_review',
        }),
      ],
    });

    const result = await prepPackage(store, 'REQ-0016', { landlordCriteriaReviewed: 'yes' });

    expect(result.to).toBe('needs_review');
    expect(store.events[0].summary).toBe('Package prepared · 4 auto-approved, 1 sent for review');
    // §8b: the landlord check is logged as its own event during prep.
    expect(store.events[1]).toMatchObject({ kind: 'landlord_criteria_reviewed' });
  });
});

// ------------------------------------------------------- change-request loop

describe('the change-request loop (SPEC §6/§7)', () => {
  it('reopens only the flagged item and leaves siblings alone', () => {
    const items = [
      lineItem({ id: 'a', itemStatus: 'approved' }),
      lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' }),
      lineItem({ id: 'c', origin: 'addon', itemStatus: 'declined' }),
    ];
    const { items: next, requestStatus } = applyChangeRequest(items, ['b']);

    expect(requestStatus).toBe('changes_requested');
    expect(next.map((i) => i.itemStatus)).toEqual(['approved', 'changes_requested', 'declined']);
  });

  it('resubmission bumps the package version and returns items to the reviewer', () => {
    const items = [
      lineItem({ id: 'a', itemStatus: 'approved' }),
      lineItem({ id: 'b', itemStatus: 'changes_requested' }),
    ];
    const outcome = applyResubmission(items, 1);

    expect(outcome.packageVersion).toBe(2);
    expect(outcome.requestStatus).toBe('needs_review');
    expect(outcome.items.map((i) => i.itemStatus)).toEqual(['approved', 'pending_review']);
  });

  it('runs the whole loop through the store', async () => {
    const store = createMemoryStore({
      request: request({ status: 'needs_review' }),
      lineItems: [
        lineItem({ id: 'a', itemStatus: 'auto_approved' }),
        lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' }),
      ],
    });

    await requestChanges(store, 'REQ-0016', ['b'], 'Move it to the dining wall.');

    expect(store.request.status).toBe('changes_requested');
    expect(store.lineItems.find((i) => i.id === 'b')?.itemStatus).toBe('changes_requested');
    expect(store.lineItems.find((i) => i.id === 'a')?.itemStatus).toBe('auto_approved');
    expect(store.changeRequests).toEqual([
      {
        requestId: 'REQ-0016',
        lineItemIds: ['b'],
        comment: 'Move it to the dining wall.',
        packageVersion: 1,
      },
    ]);

    await resubmitRequest(store, 'REQ-0016');

    expect(store.request.status).toBe('submitted');
    expect(store.request.packageVersion).toBe(2);
    expect(store.lineItems.find((i) => i.id === 'b')?.itemStatus).toBe('pending_review');

    // And it re-derives back to the reviewer.
    const reprep = await prepPackage(store, 'REQ-0016');
    expect(reprep.to).toBe('needs_review');
  });

  it('refuses request-changes without a note', async () => {
    const store = createMemoryStore({
      request: request({ status: 'needs_review' }),
      lineItems: [lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' })],
    });
    await expect(requestChanges(store, 'REQ-0016', ['b'], '   ')).rejects.toThrow(/requires a note/);
  });
});

// -------------------------------------------------------------- vendor routing

describe('vendor routing (SPEC §4)', () => {
  it('falls back to the brand policy', () => {
    expect(resolveVendorPolicy(STANDARD_MODEL, { vendorPolicyOverride: null })).toEqual({
      policy: 'signage_com',
      tail: 'internal',
    });
  });

  it('lets a brand item override it — the Freshbites pylon', () => {
    expect(
      resolveVendorPolicy(STANDARD_MODEL, { vendorPolicyOverride: 'approved_vendor' }),
    ).toEqual({ policy: 'approved_vendor', tail: 'external' });
  });
});
