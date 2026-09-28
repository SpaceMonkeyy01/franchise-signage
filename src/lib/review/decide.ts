// One place where review decisions are made (SPEC v2.3 §10.3.4).
//
// A decision reaches the product two ways: the reviewer's emailed link, and a
// signed-in brand admin or reviewer on the dashboard. The credential is each
// route's own business — resolving the link, checking the membership — and
// everything after it is here, so the two cannot drift: the same state
// machine call, the same events, the same retirement of the emailed link, and
// the same email to the franchisee. Only the route recorded differs.

import { withStatusStore } from '../db/pg-status-store';
import { queryOne } from '../db/pool';
import { notifyFranchisee } from '../email/franchisee';
import { decideLineItem, requestChanges, type Reviewer } from '../status';
import { retireLinkIfReviewComplete } from './links';

export type { Reviewer };

export interface DecisionInput {
  requestId: string;
  lineItemId: string;
  decision: 'approved' | 'declined';
  note: string;
  reviewer: Reviewer;
  /** The review link's id, when the decision came in on one. */
  linkId?: string | null;
}

/**
 * Approve or decline one item. Returns a sentence on failure, nothing on success.
 *
 * An item decided a moment ago by someone else — the other route, or a
 * colleague — fails with who decided it and how, not the state machine's bare
 * "not awaiting review": the person pressing the button needs to know the item
 * is settled, and by whom.
 */
export async function recordDecision(input: DecisionInput): Promise<string | undefined> {
  const item = await queryOne<{ name: string }>(
    `select bi.name from line_items li
       join brand_items bi on bi.id = li.brand_item_id
      where li.id = $1 and li.request_id = $2`,
    [input.lineItemId, input.requestId],
  );
  if (!item) return 'That item is not on this request.';

  const settled = await alreadyDecided(input.lineItemId);
  if (settled) return settled;
  const reviewer = await withProfile(input.reviewer);

  try {
    await withStatusStore((store) =>
      decideLineItem(store, {
        requestId: input.requestId,
        lineItemId: input.lineItemId,
        decision: input.decision,
        note: input.note,
        reviewedVia: input.linkId ?? null,
        reviewer,
        itemLabel: item.name,
      }),
    );
  } catch (error) {
    console.error('review decision failed', error);
    return (await alreadyDecided(input.lineItemId)) ??
      (error instanceof Error ? error.message : 'That decision could not be saved.');
  }

  // One email per REVIEW, not per decision (docs/DECISIONS.md #39).
  // `retireLinkIfReviewComplete` returns true exactly when nothing is left
  // pending — which is when the picture is whole. It also retires the emailed
  // link when the last decision was made on the dashboard, so the email then
  // says the review is complete instead of offering buttons that do nothing.
  const reviewComplete = await retireLinkIfReviewComplete(input.requestId);
  if (reviewComplete) await notifyFranchisee(input.requestId, 'review_decided');
  return undefined;
}

/** Send items back to the franchisee with a note. */
export async function recordChangeRequest(input: {
  requestId: string;
  lineItemIds: string[];
  comment: string;
  reviewer: Reviewer;
}): Promise<string | undefined> {
  if (!input.comment.trim()) {
    return 'Requesting changes needs a note — it is what the franchisee acts on.';
  }
  for (const id of input.lineItemIds) {
    const settled = await alreadyDecided(id);
    if (settled) return settled;
  }

  const reviewer = await withProfile(input.reviewer);
  try {
    await withStatusStore((store) =>
      requestChanges(store, input.requestId, input.lineItemIds, input.comment, reviewer),
    );
  } catch (error) {
    console.error('request-changes failed', error);
    return error instanceof Error ? error.message : 'That could not be saved.';
  }

  // The one notification that asks the franchisee to do something, so it goes
  // immediately rather than waiting for the rest of the review to finish.
  await notifyFranchisee(input.requestId, 'changes_requested');
  return undefined;
}

/**
 * A link names an address, not an account; when that address has one (a
 * reviewer who signs in too), the decision is recorded against the person.
 */
async function withProfile(reviewer: Reviewer): Promise<Reviewer> {
  if (reviewer.profileId || !reviewer.email) return reviewer;
  const profile = await queryOne<{ id: string; name: string | null }>(
    `select id, name from profiles where lower(email) = lower($1)`,
    [reviewer.email],
  );
  return profile ? { ...reviewer, profileId: profile.id, name: reviewer.name ?? profile.name } : reviewer;
}

/** "Already approved by … from the dashboard", or null while the item is still pending. */
export async function alreadyDecided(lineItemId: string): Promise<string | null> {
  const row = await queryOne<DecidedRow>(DECIDED_SQL, [lineItemId]);
  if (!row || row.item_status === 'pending_review') return null;
  return describeDecision(row);
}

export interface DecidedRow {
  name: string;
  item_status: string;
  reviewed_at: string | null;
  reviewed_route: 'link' | 'session' | null;
  reviewer_name: string | null;
  reviewed_by_email: string | null;
}

const DECIDED_SQL = `
  select bi.name, li.item_status, li.reviewed_at, li.reviewed_route,
         p.name as reviewer_name, li.reviewed_by_email
    from line_items li
    join brand_items bi on bi.id = li.brand_item_id
    left join profiles p on p.id = li.reviewed_by
   where li.id = $1`;

const STATUS_WORD: Record<string, string> = {
  approved: 'approved',
  declined: 'declined',
  changes_requested: 'sent back to the franchisee for changes',
  auto_approved: 'approved automatically under the brand rules',
};

export function describeDecision(row: DecidedRow): string {
  const what = STATUS_WORD[row.item_status] ?? row.item_status.replace(/_/g, ' ');
  const who = row.reviewer_name?.trim() || row.reviewed_by_email;
  const route =
    row.reviewed_route === 'session'
      ? ' from the dashboard'
      : row.reviewed_route === 'link'
        ? ' from the approval email'
        : '';
  const when = row.reviewed_at
    ? ` on ${new Date(row.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : '';
  return `${row.name} was already ${what}${who ? ` by ${who}` : ''}${route}${when}.`;
}
