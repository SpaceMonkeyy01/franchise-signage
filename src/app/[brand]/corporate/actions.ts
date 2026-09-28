'use server';

// What corporate can do from the dashboard (SPEC v2.3 §10.2, phase C).
//
// Behind sign-in now, so the list grew by the two things the emailed link could
// never be trusted with (DECISIONS #75): deciding items, and managing people.
// Every action checks the membership itself — Server Actions are reachable by
// direct POST, and the page having rendered is not authorization.
//
// Decisions go through src/lib/review/decide.ts, the same code the approval
// email's link calls, so both routes write the same rows (§10.3.4).

import { revalidatePath } from 'next/cache';

import { checkCorporate, type CorporateAccess } from '@/lib/auth/corporate';
import { createInvitation, revokeInvitation } from '@/lib/auth/invitations';
import { query, queryOne } from '@/lib/db/pool';
import { notifyReviewNeeded } from '@/lib/email/notify';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import type { SubmitFailure } from '@/lib/forms';
import { registerFranchisee } from '@/lib/registrations';
import { recordChangeRequest, recordDecision, type Reviewer } from '@/lib/review/decide';

type Result = SubmitFailure | undefined;

/** Auth, then the work, then one shape of failure for the whole dashboard. */
async function run(
  brandSlug: string,
  fn: (access: CorporateAccess) => Promise<string | void>,
  { manage = false, revalidate = true }: { manage?: boolean; revalidate?: boolean } = {},
): Promise<Result> {
  const access = await checkCorporate(brandSlug, { manage });
  if ('error' in access) return access;
  try {
    const error = await fn(access);
    if (error) return { error };
  } catch (error) {
    console.error('corporate action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  if (revalidate) revalidatePath(`/${brandSlug}/corporate`, 'page');
  return undefined;
}

async function requestOnBrand(requestId: string, brandId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from requests where id = $1 and brand_id = $2`,
    [requestId, brandId],
  );
  return Boolean(row);
}

function reviewerFor(access: CorporateAccess): Reviewer {
  return {
    route: 'session',
    email: access.viewer.profile.email,
    profileId: access.viewer.profile.id,
    name: access.viewer.profile.name,
    actor: access.role === 'platform_admin' ? 'team' : 'reviewer',
  };
}

// ------------------------------------------------------------------ approvals

export async function decideItemAction(
  brandSlug: string,
  requestId: string,
  input: { lineItemId: string; decision: 'approved' | 'declined'; note: string },
): Promise<Result> {
  return run(brandSlug, async (access) => {
    if (!(await requestOnBrand(requestId, access.brand.id))) {
      return 'That request is not part of this brand.';
    }
    return recordDecision({
      requestId,
      lineItemId: input.lineItemId,
      decision: input.decision,
      note: input.note,
      reviewer: reviewerFor(access),
    });
  });
}

export async function requestChangesAction(
  brandSlug: string,
  requestId: string,
  input: { lineItemIds: string[]; comment: string },
): Promise<Result> {
  return run(brandSlug, async (access) => {
    if (!(await requestOnBrand(requestId, access.brand.id))) {
      return 'That request is not part of this brand.';
    }
    return recordChangeRequest({
      requestId,
      lineItemIds: input.lineItemIds,
      comment: input.comment,
      reviewer: reviewerFor(access),
    });
  });
}

/**
 * Send the approval email again. Minting a fresh link revokes the old one —
 * two live links could decide the same package twice.
 */
export async function resendApprovalEmailAction(
  brandSlug: string,
  requestId: string,
): Promise<Result> {
  return run(
    brandSlug,
    async (access) => {
      if (!(await requestOnBrand(requestId, access.brand.id))) {
        return 'That request is not part of this brand.';
      }
      const outcome = await notifyReviewNeeded(requestId);
      if (outcome.reason === 'nothing_pending') {
        return 'Nothing on that request is waiting for approval any more.';
      }
      if (!outcome.sent) return 'That approval email could not be sent.';
    },
    { revalidate: false },
  );
}

// ---------------------------------------------------------- §8d registrations

/** Level 1 of the two-level access model (SPEC §8d) — corporate's own act. */
export async function registerFranchiseeAction(
  brandSlug: string,
  email: string,
  name: string,
): Promise<Result> {
  return run(
    brandSlug,
    async (access) => {
      await registerFranchisee({
        brandId: access.brand.id,
        email,
        name,
        registeredBy: access.role === 'platform_admin' ? 'team' : 'corporate',
      });
    },
    { manage: true },
  );
}

/** Re-send the welcome email. Deliberately does not mint a new token — see #59. */
export async function resendWelcomeAction(brandSlug: string, registrationId: string): Promise<Result> {
  return run(
    brandSlug,
    async (access) => {
      const owned = await queryOne<{ id: string }>(
        `select id from franchisee_registrations where id = $1 and brand_id = $2`,
        [registrationId, access.brand.id],
      );
      if (!owned) return 'That registration no longer exists.';
      const outcome = await sendWelcomeEmail(registrationId);
      if (outcome.reason === 'not_found') return 'That registration no longer exists.';
    },
    { manage: true },
  );
}

// -------------------------------------------------------------------- people

export type CorporateInviteRole = 'brand_admin' | 'brand_reviewer';

/**
 * Invite a brand admin or reviewer (§10.2). Brand admins manage these two roles
 * only: franchisees arrive by the §8d registration, staff by their owner.
 */
export async function inviteBrandMemberAction(
  brandSlug: string,
  email: string,
  role: CorporateInviteRole,
): Promise<{ sentTo: string; warning: string | null } | SubmitFailure> {
  if (role !== 'brand_admin' && role !== 'brand_reviewer') return { error: 'Unknown role.' };
  const access = await checkCorporate(brandSlug, { manage: true });
  if ('error' in access) return access;

  const address = email.trim();
  const already = await queryOne<{ active: boolean }>(
    `select m.active from memberships m join profiles p on p.id = m.profile_id
      where lower(p.email) = lower($1) and m.brand_id = $2 and m.role = $3`,
    [address, access.brand.id, role],
  );
  if (already?.active) return { error: `${address} already has that role.` };
  if (already) return { error: `${address} was deactivated. Reactivate them below instead.` };

  try {
    const minted = await createInvitation({
      brandId: access.brand.id,
      email: address,
      role,
      invitedBy: access.membership.id,
      inviterName: access.viewer.profile.name ?? access.viewer.profile.email,
    });
    revalidatePath(`/${brandSlug}/corporate`, 'page');
    return { sentTo: address, warning: minted.domainWarning };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The invitation could not be sent.' };
  }
}

/** Deactivate or reactivate a brand admin or reviewer. Takes effect on their next click. */
export async function setBrandMemberActiveAction(
  brandSlug: string,
  membershipId: string,
  active: boolean,
): Promise<Result> {
  return run(
    brandSlug,
    async (access) => {
      // Nobody locks themselves out by accident; someone else has to do it.
      if (membershipId === access.membership.id) return 'You cannot deactivate yourself.';
      const changed = await query<{ id: string }>(
        `update memberships
            set active = $3, deactivated_at = case when $3 then null else now() end
          where id = $1 and brand_id = $2 and role in ('brand_admin', 'brand_reviewer')
          returning id`,
        [membershipId, access.brand.id, active],
      );
      if (changed.length === 0) return 'That person is not one of this brand’s admins or reviewers.';
    },
    { manage: true },
  );
}

export async function withdrawBrandInvitationAction(
  brandSlug: string,
  invitationId: string,
): Promise<Result> {
  return run(
    brandSlug,
    async (access) => {
      const owned = await queryOne<{ id: string }>(
        `select id from invitations
          where id = $1 and brand_id = $2 and role in ('brand_admin', 'brand_reviewer')`,
        [invitationId, access.brand.id],
      );
      if (!owned) return 'That invitation is not one of this brand’s.';
      await revokeInvitation(invitationId);
    },
    { manage: true },
  );
}
