// The SPEC §6 status machine and the SPEC §7 approval rules, as pure functions.
//
// Nothing here touches a database. The DB-facing helper (transition.ts) is a
// thin shell around these so the rules can be unit-tested exactly as written,
// and so a second caller (the seed script, a backfill, a test fixture) can reuse
// them without a client.

import type {
  BrandItemRules,
  BrandRules,
  FulfillmentTail,
  LineItemOrigin,
  LineItemState,
  LineItemStatus,
  RequestStatus,
  VendorPolicy,
} from './types';

// ---------------------------------------------------------------- transitions

/**
 * Legal request-level transitions.
 *
 * Two tails diverge after `accepted` (SPEC §4): the internal tail runs
 * accepted → in_production → shipped → completed, while the external tail logs
 * accepted and jumps straight to completed because fabrication happens
 * off-platform. Both are listed here; `assertTransition` narrows by tail.
 */
export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  draft: ['submitted'],
  // The fast lane: submitted → approved in one step, skipping needs_review
  // entirely, when every item auto-approved.
  submitted: ['needs_review', 'approved'],
  // A re-review after resubmission re-enters needs_review from itself.
  needs_review: ['needs_review', 'changes_requested', 'approved'],
  changes_requested: ['submitted'],
  approved: ['sent_for_quote'],
  sent_for_quote: ['quote_ready'],
  quote_ready: ['accepted'],
  accepted: ['in_production', 'completed'],
  in_production: ['shipped'],
  shipped: ['completed'],
  completed: [],
};

/** Transitions only the external tail may take. */
const EXTERNAL_ONLY: ReadonlySet<string> = new Set(['accepted->completed']);
/** Transitions only the internal tail may take. */
const INTERNAL_ONLY: ReadonlySet<string> = new Set(['accepted->in_production']);

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  tail?: FulfillmentTail,
): boolean {
  if (!REQUEST_TRANSITIONS[from].includes(to)) return false;
  const edge = `${from}->${to}`;
  if (tail === 'internal' && EXTERNAL_ONLY.has(edge)) return false;
  if (tail === 'external' && INTERNAL_ONLY.has(edge)) return false;
  return true;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RequestStatus,
    readonly to: RequestStatus,
    readonly tail?: FulfillmentTail,
  ) {
    super(
      `Illegal request transition ${from} → ${to}` +
        (tail ? ` on the ${tail} tail` : '') +
        `. Legal next states: ${REQUEST_TRANSITIONS[from].join(', ') || '(terminal)'}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(
  from: RequestStatus,
  to: RequestStatus,
  tail?: FulfillmentTail,
): void {
  if (!canTransition(from, to, tail)) throw new InvalidTransitionError(from, to, tail);
}

// ------------------------------------------------------------ approval rules

/**
 * The initial item status at submission (SPEC §7).
 *
 * `approval_mode` is the outer switch and the four origin rules are the
 * standard model inside it:
 *   never  → corporate has opted out of review; nothing is sent to them.
 *   always → corporate asked to see everything, including the fast lane.
 *   standard_model →
 *     standard    → auto_approved (corporate never sees it)
 *     addon       → pending_review, unless the brand item overrides
 *     exception   → always pending_review; a standard sign that will not work
 *                   at the site is precisely what corporate exists to judge
 *     replacement → always auto_approved (the fast lane)
 *
 * Reading `always`/`never` as an outer switch rather than as another rule to
 * reconcile per origin is a judgment call — SPEC §7 describes the bullets and
 * the modes separately without saying which wins. The pilot brand uses
 * standard_model, where the question does not arise.
 */
export function deriveInitialItemStatus(
  origin: LineItemOrigin,
  brand: BrandRules,
  brandItem?: Pick<BrandItemRules, 'requiresReviewOverride'>,
): LineItemStatus {
  if (brand.approvalMode === 'never') return 'auto_approved';
  if (brand.approvalMode === 'always') return 'pending_review';

  switch (origin) {
    case 'standard':
      return brandItem?.requiresReviewOverride === true ? 'pending_review' : 'auto_approved';
    case 'replacement':
      return 'auto_approved';
    case 'exception':
      return 'pending_review';
    case 'addon':
      return brandItem?.requiresReviewOverride === false ? 'auto_approved' : 'pending_review';
  }
}

// ------------------------------------------------------- derived request state

export interface DerivedRequestState {
  /** Where the request should sit once the team has prepped the package. */
  status: RequestStatus;
  /** True when nothing needs corporate — the fast lane. */
  fastLane: boolean;
  pendingCount: number;
  approvedCount: number;
  declinedCount: number;
  changesRequestedCount: number;
  /**
   * Set when every item was declined. There is no request-level `declined`
   * status in SPEC §6, so the request cannot be derived anywhere sensible and
   * the team has to close it by hand. Surfaced rather than guessed.
   */
  blocked?: 'all_items_declined' | 'no_items';
}

/**
 * The status a submitted request derives to from its items (SPEC §6).
 *
 * `needs_review` only if any item is pending. Skipped entirely when all items
 * auto-approve, which is what makes the fast lane one step.
 */
export function deriveRequestStatus(items: readonly LineItemState[]): DerivedRequestState {
  const count = (s: LineItemStatus) => items.filter((i) => i.itemStatus === s).length;

  const pendingCount = count('pending_review');
  const changesRequestedCount = count('changes_requested');
  const declinedCount = count('declined');
  const approvedCount = count('approved') + count('auto_approved');

  const base = { pendingCount, approvedCount, declinedCount, changesRequestedCount };

  if (items.length === 0) {
    return { ...base, status: 'submitted', fastLane: false, blocked: 'no_items' };
  }
  // A change request outranks anything still pending: the ball is with the
  // franchisee, not the reviewer.
  if (changesRequestedCount > 0) {
    return { ...base, status: 'changes_requested', fastLane: false };
  }
  if (pendingCount > 0) {
    return { ...base, status: 'needs_review', fastLane: false };
  }
  if (approvedCount === 0) {
    return {
      ...base,
      status: 'needs_review',
      fastLane: false,
      blocked: 'all_items_declined',
    };
  }
  return {
    ...base,
    status: 'approved',
    // The fast lane is the case where corporate was never involved at all.
    fastLane: declinedCount === 0 && items.every((i) => i.itemStatus === 'auto_approved'),
  };
}

// ------------------------------------------------------- change-request loop

export interface ChangeRequestOutcome {
  items: LineItemState[];
  requestStatus: RequestStatus;
}

/**
 * A reviewer requests changes on specific items (SPEC §7).
 *
 * Only the flagged items reopen. Siblings keep whatever status they already
 * reached — an approved item is not un-approved because a different item needs
 * work, and a declined one stays declined.
 */
export function applyChangeRequest(
  items: readonly LineItemState[],
  flaggedItemIds: readonly string[],
): ChangeRequestOutcome {
  const flagged = new Set(flaggedItemIds);
  const next = items.map((item) =>
    flagged.has(item.id) ? { ...item, itemStatus: 'changes_requested' as const } : { ...item },
  );
  return { items: next, requestStatus: 'changes_requested' };
}

export interface ResubmissionOutcome {
  items: LineItemState[];
  requestStatus: RequestStatus;
  packageVersion: number;
}

/**
 * The franchisee edits the flagged items and resubmits (SPEC §6).
 *
 * The package version increments, the reopened items go back to the reviewer,
 * and the request re-derives — which lands on needs_review, triggering the
 * re-review email in Session 4.
 */
export function applyResubmission(
  items: readonly LineItemState[],
  currentPackageVersion: number,
): ResubmissionOutcome {
  const next = items.map((item) =>
    item.itemStatus === 'changes_requested'
      ? { ...item, itemStatus: 'pending_review' as const }
      : { ...item },
  );
  return {
    items: next,
    requestStatus: deriveRequestStatus(next).status,
    packageVersion: currentPackageVersion + 1,
  };
}

// ------------------------------------------------------------ vendor routing

/** Per-item vendor resolution: item override first, else the brand policy (SPEC §4). */
export function resolveVendorPolicy(
  brand: Pick<BrandRules, 'vendorPolicy'>,
  brandItem: Pick<BrandItemRules, 'vendorPolicyOverride'>,
): VendorPolicyResolution {
  const policy = brandItem.vendorPolicyOverride ?? brand.vendorPolicy;
  return { policy, tail: policy === 'signage_com' ? 'internal' : 'external' };
}

export interface VendorPolicyResolution {
  policy: VendorPolicy;
  tail: FulfillmentTail;
}
