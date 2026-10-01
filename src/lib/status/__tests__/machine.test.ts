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
  decideLineItem,
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

  it('auto-approves a like-for-like replacement (the fast lane)', () => {
    expect(deriveInitialItemStatus('replacement', STANDARD_MODEL)).toBe('auto_approved');
  });

  it('sends the replacement of a sign the brand retired to corporate (#155)', () => {
    expect(
      deriveInitialItemStatus('replacement', STANDARD_MODEL, { requiresReviewOverride: null, retired: true }),
    ).toBe('pending_review');
    const never: BrandRules = { ...STANDARD_MODEL, approvalMode: 'never' };
    expect(deriveInitialItemStatus('replacement', never, { requiresReviewOverride: null, retired: true })).toBe(
      'auto_approved',
    );
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

  it('no longer narrows by tail — a tail belongs to a package (SPEC §6 v2.2)', () => {
    // Both edges are reachable by the ROLLUP: accepted → completed when every
    // package is external, accepted → in_production as soon as the least
    // advanced package is an internal one that has started. The tail check that
    // used to live here now lives on canPackageTransition, where it means
    // something.
    expect(canTransition('accepted', 'in_production')).toBe(true);
    expect(canTransition('accepted', 'completed')).toBe(true);
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

// ---------------------------------------------------------- reviewer decisions

describe('line-item decisions (SPEC §7)', () => {
  const twoPending = () =>
    createMemoryStore({
      request: request({ status: 'needs_review' }),
      lineItems: [
        lineItem({ id: 'a', itemStatus: 'auto_approved' }),
        lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' }),
        lineItem({ id: 'c', origin: 'addon', itemStatus: 'pending_review' }),
      ],
    });

  it('leaves the request in review while any item is still pending', async () => {
    const store = twoPending();
    const outcome = await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'b',
      decision: 'approved',
      note: 'Dining area only.',
    });

    expect(outcome.transition).toBeUndefined();
    expect(store.request.status).toBe('needs_review');
    expect(store.reviewNotes.get('b')).toBe('Dining area only.');
    expect(store.events.map((e) => e.kind)).toEqual(['item_approved']);
  });

  it('moves the request once the last decision lands', async () => {
    const store = twoPending();
    await decideLineItem(store, { requestId: 'REQ-0016', lineItemId: 'b', decision: 'approved' });
    const last = await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'c',
      decision: 'declined',
    });

    expect(last.transition?.to).toBe('approved');
    expect(store.request.status).toBe('approved');
    // The decline neither blocks its siblings nor the request.
    expect(store.lineItems.find((i) => i.id === 'c')?.itemStatus).toBe('declined');
    expect(last.derived.approvedCount).toBe(2);
  });

  it('refuses to decide an item twice', async () => {
    const store = twoPending();
    await decideLineItem(store, { requestId: 'REQ-0016', lineItemId: 'b', decision: 'approved' });
    await expect(
      decideLineItem(store, { requestId: 'REQ-0016', lineItemId: 'b', decision: 'declined' }),
    ).rejects.toThrow(/not awaiting review/);
  });

  // SPEC §6: the review opens at package prep. Before it, a decision would skip
  // prep — the last one moving the request from submitted straight to approved.
  it('refuses a decision before the package is prepared', async () => {
    const store = createMemoryStore({
      request: request({ status: 'submitted' }),
      lineItems: [lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' })],
    });
    await expect(
      decideLineItem(store, { requestId: 'REQ-0016', lineItemId: 'b', decision: 'approved' }),
    ).rejects.toThrow(/still preparing/);
    expect(store.request.status).toBe('submitted');
    expect(store.lineItems[0].itemStatus).toBe('pending_review');
    expect(store.events).toEqual([]);
  });

  it('refuses a change request before the package is prepared, writing nothing', async () => {
    const store = createMemoryStore({
      request: request({ status: 'submitted' }),
      lineItems: [lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' })],
    });
    await expect(requestChanges(store, 'REQ-0016', ['b'], 'Smaller, please.')).rejects.toThrow(
      /still preparing/,
    );
    expect(store.lineItems[0].itemStatus).toBe('pending_review');
    expect(store.events).toEqual([]);
  });

  it('decides a resubmission, which goes straight back to corporate', async () => {
    const store = createMemoryStore({
      request: request({ status: 'submitted', packageVersion: 2 }),
      lineItems: [lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' })],
    });
    const outcome = await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'b',
      decision: 'approved',
    });
    expect(outcome.itemStatus).toBe('approved');
  });

  it('still decides a sibling while a change request is out (SPEC §7)', async () => {
    const store = createMemoryStore({
      request: request({ status: 'changes_requested' }),
      lineItems: [
        lineItem({ id: 'b', origin: 'addon', itemStatus: 'changes_requested' }),
        lineItem({ id: 'c', origin: 'addon', itemStatus: 'pending_review' }),
      ],
    });
    const outcome = await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'c',
      decision: 'approved',
    });
    expect(outcome.itemStatus).toBe('approved');
  });

  it('parks an all-declined request rather than inventing a status', async () => {
    const store = createMemoryStore({
      request: request({ status: 'needs_review' }),
      lineItems: [lineItem({ id: 'b', origin: 'addon', itemStatus: 'pending_review' })],
    });
    const outcome = await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'b',
      decision: 'declined',
    });

    expect(outcome.derived.blocked).toBe('all_items_declined');
    expect(outcome.transition).toBeUndefined();
    expect(store.request.status).toBe('needs_review');
  });

  // SPEC v2.3 §10.3.4: the link and the dashboard write the same events, with
  // the route and the person recorded.
  it('records who decided, and by which route', async () => {
    const store = twoPending();
    await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'b',
      decision: 'approved',
      itemLabel: 'Neon Leaf',
      reviewer: { route: 'session', email: 'r@brand.test', profileId: 'p1', name: 'Jordan Reyes' },
    });
    await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'c',
      decision: 'approved',
      itemLabel: 'Menu Board',
      reviewer: { route: 'link', email: 'r@brand.test', profileId: null },
    });

    const [first, second, review] = store.events;
    expect(first.actor).toBe('reviewer');
    expect(first.summary).toBe('Neon Leaf approved by corporate (Jordan Reyes)');
    expect(first.detail).toMatchObject({ via: 'session', by: 'r@brand.test', profileId: 'p1' });
    expect(second.detail).toMatchObject({ via: 'link', by: 'r@brand.test' });
    expect(review.toStatus).toBe('approved');
    expect(store.reviewers.get('b')?.route).toBe('session');
  });

  it('says when Signage.com decides on the brand’s behalf', async () => {
    const store = twoPending();
    await decideLineItem(store, {
      requestId: 'REQ-0016',
      lineItemId: 'b',
      decision: 'declined',
      itemLabel: 'Neon Leaf',
      reviewer: { route: 'session', email: 'team@signage.test', profileId: 'p0', actor: 'team' },
    });
    expect(store.events[0].actor).toBe('team');
    expect(store.events[0].summary).toBe("Neon Leaf declined by Signage.com on the brand's behalf");
  });
});

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
        resolvedAt: null,
      },
    ]);

    await resubmitRequest(store, 'REQ-0016');

    expect(store.request.status).toBe('submitted');
    expect(store.request.packageVersion).toBe(2);
    expect(store.lineItems.find((i) => i.id === 'b')?.itemStatus).toBe('pending_review');
    // Answered: the status page stops showing "corporate asked for changes".
    expect(store.changeRequests[0].resolvedAt).not.toBeNull();

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
