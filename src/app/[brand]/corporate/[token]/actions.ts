'use server';

// What corporate can do from the dashboard (SPEC §9 interface 6).
//
// The list is short on purpose, and every entry passes the same test: does it
// change signage, or does it move information? Registering a franchisee and
// re-sending mail move information. Approving does not, and is not here — the
// dashboard link is long-lived and multi-use, and letting it decide would widen
// the approval credential §10 deliberately narrowed (DECISIONS #75).
//
// Server Actions are reachable by direct POST, so each one re-resolves the token
// itself. The page having rendered is not authorization.

import { revalidatePath } from 'next/cache';

import { assertCorporateSession } from '@/lib/corporate/session';
import { queryOne } from '@/lib/db/pool';
import { notifyReviewNeeded } from '@/lib/email/notify';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import type { SubmitFailure } from '@/lib/forms';
import { registerFranchisee } from '@/lib/registrations';

type Result = SubmitFailure | undefined;

/**
 * Auth, then the work, then one shape of failure for the whole dashboard.
 *
 * `revalidate` is a parameter rather than something every action does: a
 * registration changes what the page lists and has to refresh it, while
 * re-sending an email leaves every figure, card and item exactly where it was.
 * Refreshing for a change nobody made costs a round trip and a full re-render of
 * a page that just queried five tables.
 */
async function run(
  brandSlug: string,
  token: string,
  fn: (brandId: string) => Promise<void>,
  revalidate = true,
): Promise<Result> {
  try {
    const session = await assertCorporateSession(brandSlug, token);
    await fn(session.brand.id);
  } catch (error) {
    console.error('corporate action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  if (revalidate) revalidatePath(`/${brandSlug}/corporate/${token}`, 'page');
  return undefined;
}

/**
 * Level 1 of the two-level access model (SPEC §8d) — corporate's own act.
 *
 * `registeredBy: 'corporate'` is the whole difference from the team's copy of
 * this on /admin, and it is the point: §8d's actor is the franchisor at
 * agreement signing, and the record should say when that is who actually typed
 * it (DECISIONS #61).
 */
export async function registerFranchiseeAction(
  brandSlug: string,
  token: string,
  email: string,
  name: string,
): Promise<Result> {
  return run(brandSlug, token, async (brandId) => {
    await registerFranchisee({ brandId, email, name, registeredBy: 'corporate' });
  });
}

/** Re-send the welcome email. Deliberately does not mint a new token — see #59. */
export async function resendWelcomeAction(
  brandSlug: string,
  token: string,
  registrationId: string,
): Promise<Result> {
  return run(brandSlug, token, async (brandId) => {
    const owned = await queryOne<{ id: string }>(
      `select id from franchisee_registrations where id = $1 and brand_id = $2`,
      [registrationId, brandId],
    );
    if (!owned) throw new Error('That registration no longer exists.');

    const outcome = await sendWelcomeEmail(registrationId);
    if (outcome.reason === 'not_found') throw new Error('That registration no longer exists.');
  });
}

/**
 * Send the approval email again.
 *
 * The one thing the approvals view can do about an approval, and the realistic
 * ask: the reviewer cannot find the message. It goes to the address configured
 * on the brand and nowhere else, so this cannot be used to move a decision to
 * someone new. Minting a fresh link revokes the old one, which is the existing
 * rule for re-review (`mintReviewLink`) and the right one here too — two live
 * links could decide the same package twice.
 */
export async function resendApprovalEmailAction(
  brandSlug: string,
  token: string,
  requestId: string,
): Promise<Result> {
  return run(
    brandSlug,
    token,
    async (brandId) => {
      const owned = await queryOne<{ id: string }>(
        `select id from requests where id = $1 and brand_id = $2`,
        [requestId, brandId],
      );
      if (!owned) throw new Error('That request is not part of this brand.');

      const outcome = await notifyReviewNeeded(requestId);
      if (outcome.reason === 'nothing_pending') {
        throw new Error('Nothing on that request is waiting for approval any more.');
      }
      if (!outcome.sent) throw new Error('That approval email could not be sent.');
    },
    false,
  );
}
