// The transition helper: the single write path for request status.
//
// Rule it exists to enforce (CLAUDE.md): every status transition writes a
// request_events row. Nothing else in the codebase should UPDATE requests.status
// directly — if it does, a timeline silently loses a step and every downstream
// email, dashboard and lender document inherits the gap.
//
// Persistence is behind the StatusStore interface so the rules can be tested
// against an in-memory store, and so the Supabase implementation stays a
// mechanical adapter (supabase-store.ts).

import { statusChangeSummary, type RequestEventInput } from './events';
import {
  applyChangeRequest,
  applyResubmission,
  assertTransition,
  deriveRequestStatus,
  type DerivedRequestState,
} from './machine';
import { planInstalledSignWriteback, type WritebackPlan } from './writeback';
import type {
  EventActor,
  FulfillmentTail,
  InstalledSignState,
  LineItemState,
  LineItemStatus,
  RequestState,
  RequestStatus,
} from './types';

export interface StatusStore {
  getRequest(requestId: string): Promise<RequestState | null>;
  getLineItems(requestId: string): Promise<LineItemState[]>;
  getInstalledSigns(locationId: string): Promise<InstalledSignState[]>;
  /** Which tail the request is on, from its quotes. Null before routing. */
  getFulfillmentTail(requestId: string): Promise<FulfillmentTail | null>;

  updateRequest(
    requestId: string,
    patch: Partial<Pick<RequestState, 'status' | 'packageVersion'>> & {
      submittedAt?: Date;
    },
  ): Promise<void>;
  setLineItemStatus(lineItemId: string, status: LineItemStatus): Promise<void>;
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
  /** Present only on the transition into `completed`. */
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
 * The transition into `completed` also performs the installed_signs writeback —
 * the only place in the system that touches the permanent location record.
 */
export async function transitionRequest(
  store: StatusStore,
  options: TransitionOptions,
): Promise<TransitionResult> {
  const request = await store.getRequest(options.requestId);
  if (!request) throw new RequestNotFoundError(options.requestId);

  const from = request.status;
  const tail = (await store.getFulfillmentTail(request.id)) ?? undefined;
  assertTransition(from, options.to, tail);

  let writeback: WritebackPlan | undefined;
  if (options.to === 'completed') {
    writeback = await applyWriteback(store, request);
  }

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

  return { from, to: options.to, writeback };
}

async function applyWriteback(store: StatusStore, request: RequestState): Promise<WritebackPlan> {
  const items = await store.getLineItems(request.id);
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
