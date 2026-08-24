// The transition helper: the single write path for request status.
//
// Rule it exists to enforce (CLAUDE.md): every status transition writes a
// request_events row. Nothing else in the codebase should UPDATE requests.status
// directly — if it does, a timeline silently loses a step and every downstream
// email, dashboard and lender document inherits the gap.
//
// Persistence is behind the StatusStore interface so the rules can be tested
// against an in-memory store, and so the real implementation stays a mechanical
// adapter (src/lib/db/pg-status-store.ts).

import { statusChangeSummary, type RequestEventInput } from './events';
import {
  applyChangeRequest,
  applyResubmission,
  assertPackageTransition,
  assertTransition,
  derivePackageStatus,
  deriveRequestStatus,
  deriveRequestStatusFromPackages,
  isFulfillmentAdvance,
  packageTail,
  type DerivedRequestState,
} from './machine';
import { planInstalledSignWriteback, type WritebackPlan } from './writeback';
import type {
  EventActor,
  InstalledSignState,
  LineItemState,
  LineItemStatus,
  PackageState,
  PackageStatus,
  RequestState,
  RequestStatus,
} from './types';

export interface StatusStore {
  getRequest(requestId: string): Promise<RequestState | null>;
  getLineItems(requestId: string): Promise<LineItemState[]>;
  getInstalledSigns(locationId: string): Promise<InstalledSignState[]>;
  /** The request's quote packages. Empty before routing (SPEC §6, v2.2). */
  getPackages(requestId: string): Promise<PackageState[]>;
  /** Stamp one package's stage date. The only write that moves a package. */
  markPackage(quoteId: string, stage: PackageStatus, at: Date): Promise<void>;

  updateRequest(
    requestId: string,
    patch: Partial<Pick<RequestState, 'status' | 'packageVersion'>> & {
      submittedAt?: Date;
    },
  ): Promise<void>;
  setLineItemStatus(lineItemId: string, status: LineItemStatus): Promise<void>;
  /** A reviewer's decision on one item: status, their note, and when. */
  setLineItemReview(
    lineItemId: string,
    review: { status: LineItemStatus; note: string | null; reviewedVia?: string | null },
  ): Promise<void>;
  insertEvent(event: RequestEventInput): Promise<void>;
  insertInstalledSign(row: {
    locationId: string;
    brandItemId: string;
    sizing: string | null;
    mockupFileId: string | null;
    sourceLineItemId: string;
  }): Promise<void>;
  updateInstalledSign(
    installedSignId: string,
    patch: {
      sizing: string | null;
      mockupFileId: string | null;
      sourceLineItemId: string;
    },
  ): Promise<void>;
  insertChangeRequest(row: {
    requestId: string;
    lineItemIds: string[];
    comment: string;
    packageVersion: number;
  }): Promise<void>;
  /** Close the open change requests — the franchisee has answered them. */
  resolveChangeRequests(requestId: string): Promise<void>;
}

export interface TransitionOptions {
  requestId: string;
  to: RequestStatus;
  actor: EventActor;
  /** Timeline wording. Defaults to a plain status line. */
  summary?: string;
  kind?: RequestEventInput['kind'];
  detail?: Record<string, unknown>;
  lineItemId?: string | null;
  /** Extra columns to set in the same update as the status. */
  patch?: { packageVersion?: number; submittedAt?: Date };
}

export interface TransitionResult {
  from: RequestStatus;
  to: RequestStatus;
  /** Present only on a PACKAGE reaching `completed` (SPEC §6, v2.2). */
  writeback?: WritebackPlan;
}

export class RequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Request ${requestId} not found`);
    this.name = 'RequestNotFoundError';
  }
}

/**
 * Move a request to `to`, writing exactly one request_event.
 *
 * Used directly for everything up to and including `sent_for_quote`. After
 * routing the request status is a ROLLUP of its packages and nothing should call
 * this by hand — `transitionPackage` moves a package and syncs the request from
 * it (SPEC §6, amended v2.2).
 */
export async function transitionRequest(
  store: StatusStore,
  options: TransitionOptions,
): Promise<TransitionResult> {
  const request = await store.getRequest(options.requestId);
  if (!request) throw new RequestNotFoundError(options.requestId);

  const from = request.status;
  assertTransition(from, options.to);

  await store.updateRequest(request.id, { status: options.to, ...options.patch });
  await store.insertEvent({
    requestId: request.id,
    lineItemId: options.lineItemId ?? null,
    kind: options.kind ?? 'status_changed',
    actor: options.actor,
    summary: options.summary ?? statusChangeSummary(from, options.to),
    detail: options.detail ?? {},
    fromStatus: from,
    toStatus: options.to,
  });

  return { from, to: options.to };
}

/**
 * The installed_signs writeback for ONE package reaching `completed`.
 *
 * Scoped to the package's own items (SPEC §6, amended v2.2): a split site's
 * Signage.com signs go on the location record when Signage.com installs them,
 * rather than waiting on a vendor who may be weeks behind. `completed` is still
 * the only transition that writes this table — it is now the package's.
 */
async function applyWriteback(
  store: StatusStore,
  request: RequestState,
  scope: readonly string[],
): Promise<WritebackPlan> {
  const all = await store.getLineItems(request.id);
  const inPackage = new Set(scope);
  const items = all.filter((item) => inPackage.has(item.id));
  const installed = await store.getInstalledSigns(request.locationId);
  const plan = planInstalledSignWriteback(request, items, installed);

  for (const op of plan.operations) {
    if (op.kind === 'insert') {
      await store.insertInstalledSign({
        locationId: op.locationId,
        brandItemId: op.brandItemId,
        sizing: op.sizing,
        mockupFileId: op.mockupFileId,
        sourceLineItemId: op.sourceLineItemId,
      });
    } else {
      await store.updateInstalledSign(op.installedSignId, {
        sizing: op.sizing,
        mockupFileId: op.mockupFileId,
        sourceLineItemId: op.sourceLineItemId,
      });
    }
  }
  return plan;
}

// ----------------------------------------------------------- package moves
// SPEC §6 (amended v2.2). A request split across recipients has one package per
// recipient, each running its own tail at its own pace, and the request status
// is the rollup. Everything after routing goes through here.

export interface PackageTransitionResult {
  quoteId: string;
  from: PackageStatus;
  to: PackageStatus;
  /** Present only on `completed` — this package's items, written back. */
  writeback?: WritebackPlan;
  /** Set only when this package's move also moved the request. */
  request?: TransitionResult;
}

export class PackageNotFoundError extends Error {
  constructor(quoteId: string) {
    super(`Quote package ${quoteId} not found on this request`);
    this.name = 'PackageNotFoundError';
  }
}

/**
 * Move ONE quote package, then let the request follow.
 *
 * The order matters. The package moves first and writes its own event, because
 * that is the fact — Signage.com started fabricating, the vendor's order was
 * logged. The request status is then re-derived from every package and written
 * only if it actually changed, so a split request records "your Signage.com
 * signs are in production" without claiming the whole site is.
 */
export async function transitionPackage(
  store: StatusStore,
  options: {
    requestId: string;
    quoteId: string;
    to: PackageStatus;
    actor: EventActor;
    kind?: RequestEventInput['kind'];
    summary?: string;
    detail?: Record<string, unknown>;
  },
): Promise<PackageTransitionResult> {
  const request = await store.getRequest(options.requestId);
  if (!request) throw new RequestNotFoundError(options.requestId);

  const packages = await store.getPackages(options.requestId);
  const pkg = packages.find((candidate) => candidate.id === options.quoteId);
  if (!pkg) throw new PackageNotFoundError(options.quoteId);

  const from = derivePackageStatus(pkg);
  assertPackageTransition(from, options.to, packageTail(pkg));

  // Before the date is stamped, so a writeback failure leaves the package where
  // it was rather than completed-but-unrecorded.
  let writeback: WritebackPlan | undefined;
  if (options.to === 'completed') {
    writeback = await applyWriteback(store, request, pkg.lineItemIds);
  }

  const at = new Date();
  await store.markPackage(pkg.id, options.to, at);

  // Named on the timeline even when only one package exists: "Package —
  // Meridian Sign Co. shipped" reads correctly either way, and on a split it is
  // the only thing that says which half moved.
  const label = pkg.recipientName ?? (pkg.external ? 'the vendor' : 'Signage.com');
  await store.insertEvent({
    requestId: request.id,
    kind: options.kind ?? 'package_status_changed',
    actor: options.actor,
    summary: options.summary ?? `${label}'s package: ${from} → ${options.to}`,
    detail: { ...(options.detail ?? {}), quoteId: pkg.id, recipient: label, packageStatus: options.to },
  });

  const next = packages.map((candidate) =>
    candidate.id === pkg.id ? stampedLocally(candidate, options.to, at) : candidate,
  );
  const rolled = deriveRequestStatusFromPackages(next);

  let requestMove: TransitionResult | undefined;
  // Only ever forwards. On well-formed data the rollup cannot regress, and on
  // ill-formed data (a hand-edited row, a backfill) the package's own event is
  // still written — the request simply stays where it is rather than being
  // dragged back through a status it already announced.
  if (rolled && isFulfillmentAdvance(request.status, rolled)) {
    requestMove = await transitionRequest(store, {
      requestId: request.id,
      to: rolled,
      actor: options.actor,
      // The rollup is a consequence, not somebody's action, and the timeline
      // should read that way: the package event above says who did what.
      summary: rollupSummary(rolled, next.length),
      detail: { rolledUpFrom: next.length, packages: next.length },
    });
  }

  return { quoteId: pkg.id, from, to: options.to, writeback, request: requestMove };
}

/** The same stamp `markPackage` writes, applied in memory to re-derive the rollup. */
function stampedLocally(pkg: PackageState, stage: PackageStatus, at: Date): PackageState {
  switch (stage) {
    case 'quote_ready':
      return { ...pkg, deliveredAt: at };
    case 'accepted':
      return { ...pkg, acceptedAt: at };
    case 'in_production':
      return { ...pkg, inProductionAt: at };
    case 'shipped':
      return { ...pkg, shippedAt: at };
    case 'completed':
      return { ...pkg, completedAt: at };
    default:
      return pkg;
  }
}

function rollupSummary(status: RequestStatus, packageCount: number): string {
  const across = packageCount > 1 ? ` · all ${packageCount} packages` : '';
  switch (status) {
    case 'quote_ready':
      return `Every package is quoted${across}`;
    case 'accepted':
      return `Every package is accepted${across}`;
    case 'in_production':
      return `In production${across}`;
    case 'shipped':
      return `Shipped${across}`;
    case 'completed':
      return `Installed — location record updated${across}`;
    default:
      return statusChangeSummary(status, status);
  }
}

// ------------------------------------------------------------- named actions
// The transitions the product actually performs, so call sites read as the
// domain rather than as state names.

/** Franchisee submits. Items already carry their derived initial statuses. */
export async function submitRequest(
  store: StatusStore,
  requestId: string,
  summary: string,
): Promise<TransitionResult> {
  return transitionRequest(store, {
    requestId,
    to: 'submitted',
    actor: 'franchisee',
    kind: 'request_submitted',
    summary,
    patch: { submittedAt: new Date() },
  });
}

export interface PackagePrepResult extends TransitionResult {
  derived: DerivedRequestState;
}

/**
 * The team preps the package, and the request derives forward.
 *
 * This is where the fast lane collapses: when every item auto-approved, the
 * request goes submitted → approved in one step and corporate is never emailed.
 * Otherwise it lands on needs_review and Session 4's approval mail goes out.
 */
export async function prepPackage(
  store: StatusStore,
  requestId: string,
  options: { landlordCriteriaReviewed?: 'yes' | 'no' | 'not_provided' } = {},
): Promise<PackagePrepResult> {
  const items = await store.getLineItems(requestId);
  const derived = deriveRequestStatus(items);

  if (derived.blocked) {
    throw new Error(
      `Cannot prep package for ${requestId}: ${derived.blocked}. ` +
        `SPEC §6 has no request-level status for this; the team closes it manually.`,
    );
  }

  const summary = derived.fastLane
    ? 'Package prepared · no review needed'
    : `Package prepared · ${derived.approvedCount} auto-approved, ${derived.pendingCount} sent for review`;

  const result = await transitionRequest(store, {
    requestId,
    to: derived.status,
    actor: 'team',
    kind: 'package_prepared',
    summary,
    detail: {
      autoApproved: derived.approvedCount,
      pendingReview: derived.pendingCount,
      fastLane: derived.fastLane,
    },
  });

  // §8b: the landlord criteria check is part of package prep, and is logged
  // whether or not criteria were provided.
  if (options.landlordCriteriaReviewed) {
    await store.insertEvent({
      requestId,
      kind: 'landlord_criteria_reviewed',
      actor: 'team',
      summary: `Landlord sign criteria reviewed: ${options.landlordCriteriaReviewed.replace(/_/g, ' ')}`,
      detail: { result: options.landlordCriteriaReviewed },
    });
  }

  return { ...result, derived };
}

export interface DecisionOutcome {
  itemStatus: LineItemStatus;
  derived: DerivedRequestState;
  /** Set when this decision was the last one outstanding and the request moved. */
  transition?: TransitionResult;
}

/**
 * A reviewer approves or declines ONE item (SPEC §7).
 *
 * Approval is line-item level, so nothing about this touches the siblings: a
 * decline writes a declined item and the rest of the request carries on. The
 * request itself only moves when nothing is left pending, which is what makes a
 * five-item package with one slow decision still deliver the other four.
 *
 * An all-declined request has nowhere to go (SPEC §6 has no request-level
 * `declined`), so the derivation says so and the request is left for the team —
 * see docs/DECISIONS.md #9.
 */
export async function decideLineItem(
  store: StatusStore,
  options: {
    requestId: string;
    lineItemId: string;
    decision: 'approved' | 'declined';
    note?: string | null;
    /** The single-use review token the decision arrived on, when there is one. */
    reviewedVia?: string | null;
    itemLabel?: string;
  },
): Promise<DecisionOutcome> {
  const request = await store.getRequest(options.requestId);
  if (!request) throw new RequestNotFoundError(options.requestId);

  const items = await store.getLineItems(options.requestId);
  const item = items.find((candidate) => candidate.id === options.lineItemId);
  if (!item) throw new Error(`Line item ${options.lineItemId} is not on ${options.requestId}`);
  if (item.itemStatus !== 'pending_review') {
    throw new Error(`That item is not awaiting review (it is ${item.itemStatus}).`);
  }

  const note = options.note?.trim() || null;
  await store.setLineItemReview(item.id, {
    status: options.decision,
    note,
    reviewedVia: options.reviewedVia ?? null,
  });

  const label = options.itemLabel ?? 'Item';
  await store.insertEvent({
    requestId: request.id,
    lineItemId: item.id,
    kind: options.decision === 'approved' ? 'item_approved' : 'item_declined',
    actor: 'reviewer',
    summary: `${label} ${options.decision} by corporate${note ? `: "${note}"` : ''}`,
    detail: { lineItemId: item.id, note },
  });

  const next = items.map((candidate) =>
    candidate.id === item.id ? { ...candidate, itemStatus: options.decision } : candidate,
  );
  const derived = deriveRequestStatus(next);

  // Only the last outstanding decision moves the request.
  if (derived.blocked || derived.status === request.status) {
    return { itemStatus: options.decision, derived };
  }

  const transition = await transitionRequest(store, {
    requestId: request.id,
    to: derived.status,
    actor: 'reviewer',
    summary: `Corporate review complete · ${derived.approvedCount} approved${
      derived.declinedCount ? `, ${derived.declinedCount} declined` : ''
    }`,
    detail: { approved: derived.approvedCount, declined: derived.declinedCount },
  });
  return { itemStatus: options.decision, derived, transition };
}

/** A reviewer requests changes on specific items; only those reopen. */
export async function requestChanges(
  store: StatusStore,
  requestId: string,
  flaggedItemIds: string[],
  comment: string,
): Promise<TransitionResult> {
  if (!comment.trim()) {
    throw new Error('Request-changes requires a note (SPEC §7).');
  }
  const request = await store.getRequest(requestId);
  if (!request) throw new RequestNotFoundError(requestId);

  const items = await store.getLineItems(requestId);
  const { items: next } = applyChangeRequest(items, flaggedItemIds);

  for (const item of next) {
    if (item.itemStatus === 'changes_requested') {
      await store.setLineItemStatus(item.id, 'changes_requested');
    }
  }
  await store.insertChangeRequest({
    requestId,
    lineItemIds: flaggedItemIds,
    comment,
    packageVersion: request.packageVersion,
  });

  return transitionRequest(store, {
    requestId,
    to: 'changes_requested',
    actor: 'reviewer',
    kind: 'changes_requested',
    summary: `Changes requested on ${flaggedItemIds.length} item(s): ${comment}`,
    detail: { lineItemIds: flaggedItemIds, comment },
  });
}

/**
 * The franchisee resubmits after editing the flagged items.
 *
 * The package version increments and the reopened items go back to pending;
 * everything already approved stays approved.
 */
export async function resubmitRequest(
  store: StatusStore,
  requestId: string,
): Promise<TransitionResult> {
  const request = await store.getRequest(requestId);
  if (!request) throw new RequestNotFoundError(requestId);

  const items = await store.getLineItems(requestId);
  const outcome = applyResubmission(items, request.packageVersion);

  for (const item of items) {
    if (item.itemStatus === 'changes_requested') {
      await store.setLineItemStatus(item.id, 'pending_review');
    }
  }
  // The open change request is answered by this resubmission. Closing it is what
  // stops the franchisee's status page from still showing "corporate asked for
  // changes" after they have made them.
  await store.resolveChangeRequests(requestId);

  return transitionRequest(store, {
    requestId,
    to: 'submitted',
    actor: 'franchisee',
    kind: 'request_resubmitted',
    summary: `Resubmitted with changes · package v${outcome.packageVersion}`,
    detail: { packageVersion: outcome.packageVersion },
    patch: { packageVersion: outcome.packageVersion },
  });
}
