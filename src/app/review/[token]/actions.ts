'use server';

// The reviewer's decisions, arriving from an email link.
//
// The token is re-resolved on every action, never trusted from the form: it is
// the entire credential (SPEC §10), it can expire or be revoked between the page
// rendering and the button being pressed, and a Server Action is reachable by
// direct POST regardless of what page produced it.
//
// Decisions are POST-only for a reason that is easy to miss: corporate mail
// scanners follow every link in a message. A GET that approved a sign would be
// approved by a spam filter. The link opens a page; the page asks.

import { revalidatePath } from 'next/cache';

import { withStatusStore } from '@/lib/db/pg-status-store';
import { queryOne } from '@/lib/db/pool';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { notifyReviewNeeded } from '@/lib/email/notify';
import type { SubmitFailure } from '@/lib/forms';
import { resolveReviewLink, retireLinkIfReviewComplete } from '@/lib/review/links';
import { decideLineItem, requestChanges } from '@/lib/status';

const LINK_MESSAGE: Record<string, string> = {
  unknown: 'That link is not one we issued.',
  expired: 'That link has expired. Ask the Signage.com team to send a fresh one.',
  revoked:
    'That link was replaced — the request has changed since it was sent, and a newer email has the current version.',
  used: 'This review is already complete. Nothing here is waiting on you.',
};

export async function decideItemAction(input: {
  token: string;
  lineItemId: string;
  decision: 'approved' | 'declined';
  note: string;
}): Promise<SubmitFailure | undefined> {
  const resolved = await resolveReviewLink(input.token);
  if (!resolved.ok) return { error: LINK_MESSAGE[resolved.failure.reason] };
  const { link } = resolved;

  const item = await queryOne<{ name: string }>(
    `select bi.name from line_items li
       join brand_items bi on bi.id = li.brand_item_id
      where li.id = $1 and li.request_id = $2`,
    [input.lineItemId, link.requestId],
  );
  if (!item) return { error: 'That item is not on this request.' };

  try {
    await withStatusStore((store) =>
      decideLineItem(store, {
        requestId: link.requestId,
        lineItemId: input.lineItemId,
        decision: input.decision,
        note: input.note,
        // Recorded on the line item: which link a decision came in on is part of
        // the audit trail behind an approval.
        reviewedVia: link.id,
        itemLabel: item.name,
      }),
    );
  } catch (error) {
    console.error('review decision failed', error);
    return { error: error instanceof Error ? error.message : 'That decision could not be saved.' };
  }

  // One email per REVIEW, not per decision (docs/DECISIONS.md #39). A reviewer
  // decides five signs in one sitting; five emails about one sitting is worse
  // than one that says what happened. `retireLinkIfReviewComplete` returns true
  // exactly when nothing is left pending — which is when the picture is whole.
  const reviewComplete = await retireLinkIfReviewComplete(link.requestId);
  if (reviewComplete) await notifyFranchisee(link.requestId, 'review_decided');

  revalidatePath(`/review/${input.token}`);
  return undefined;
}

export async function requestChangesAction(input: {
  token: string;
  lineItemIds: string[];
  comment: string;
}): Promise<SubmitFailure | undefined> {
  const resolved = await resolveReviewLink(input.token);
  if (!resolved.ok) return { error: LINK_MESSAGE[resolved.failure.reason] };
  if (!input.comment.trim()) {
    return { error: 'Requesting changes needs a note — it is what the franchisee acts on.' };
  }

  try {
    await withStatusStore((store) =>
      requestChanges(store, resolved.link.requestId, input.lineItemIds, input.comment),
    );
  } catch (error) {
    console.error('request-changes failed', error);
    return { error: error instanceof Error ? error.message : 'That could not be saved.' };
  }

  // The one notification that asks the franchisee to do something, so it goes
  // immediately rather than waiting for the rest of the review to finish — the
  // note is what they act on, and the sooner they have it the better.
  await notifyFranchisee(resolved.link.requestId, 'changes_requested');

  revalidatePath(`/review/${input.token}`);
  return undefined;
}

/**
 * Re-review after the franchisee resubmits.
 *
 * Exported here because the franchisee's resubmission is what triggers it, and
 * this module already owns the reviewer's side of the loop.
 */
export async function notifyReReview(requestId: string): Promise<void> {
  await notifyReviewNeeded(requestId);
}
