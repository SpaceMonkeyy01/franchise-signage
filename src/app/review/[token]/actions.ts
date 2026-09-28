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
//
// What happens after the credential is src/lib/review/decide.ts, shared with
// the signed-in dashboard (SPEC v2.3 §10.3.4).

import { revalidatePath } from 'next/cache';

import type { SubmitFailure } from '@/lib/forms';
import { recordChangeRequest, recordDecision } from '@/lib/review/decide';
import { resolveReviewLink } from '@/lib/review/links';
import { notifyReviewNeeded } from '@/lib/email/notify';

const LINK_MESSAGE: Record<string, string> = {
  unknown: 'That link is not one we issued.',
  expired: 'That link has expired. Ask the Signage.com team to send a fresh one.',
  revoked:
    'That link was replaced — the request has changed since it was sent, and a newer email has the current version.',
  used: 'This review is already complete. Nothing here is waiting on you.',
};

export async function decideItemAction(
  token: string,
  input: { lineItemId: string; decision: 'approved' | 'declined'; note: string },
): Promise<SubmitFailure | undefined> {
  const resolved = await resolveReviewLink(token);
  if (!resolved.ok) return { error: LINK_MESSAGE[resolved.failure.reason] };
  const { link } = resolved;

  const error = await recordDecision({
    requestId: link.requestId,
    lineItemId: input.lineItemId,
    decision: input.decision,
    note: input.note,
    linkId: link.id,
    reviewer: { route: 'link', email: link.reviewerEmail, profileId: null },
  });
  if (error) return { error };

  revalidatePath(`/review/${token}`);
  return undefined;
}

export async function requestChangesAction(
  token: string,
  input: { lineItemIds: string[]; comment: string },
): Promise<SubmitFailure | undefined> {
  const resolved = await resolveReviewLink(token);
  if (!resolved.ok) return { error: LINK_MESSAGE[resolved.failure.reason] };

  const error = await recordChangeRequest({
    requestId: resolved.link.requestId,
    lineItemIds: input.lineItemIds,
    comment: input.comment,
    reviewer: { route: 'link', email: resolved.link.reviewerEmail, profileId: null },
  });
  if (error) return { error };

  revalidatePath(`/review/${token}`);
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
