'use server';

// One way in for every invitation the team sends (DECISIONS #190): choose the
// account type and, for everyone but a Signage.com admin, the brand — and for
// a store manager, the franchisee company and its stores. Each kind goes
// through the same function its own screen uses, so the rules (duplicates,
// one staff role per brand, the welcome email for an owner) stay in one place.

import { revalidatePath } from 'next/cache';

import { resetTotp } from '@/lib/auth/identity';
import { createInvitation, revokeInvitation } from '@/lib/auth/invitations';
import { clearFailedSignIns } from '@/lib/auth/password';
import { assertTeamMember } from '@/lib/auth/team';
import { query, queryOne } from '@/lib/db/pool';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import type { SubmitFailure } from '@/lib/forms';
import { registerFranchisee } from '@/lib/registrations';
import { inviteStaff } from '@/lib/staff';

export type InviteRole = 'platform_admin' | 'brand_admin' | 'brand_reviewer' | 'franchisee_owner' | 'franchisee_staff';

export interface InviteInput {
  role: InviteRole;
  brandId: string | null;
  email: string;
  name: string;
  franchiseeId: string | null;
  locationIds: string[];
}

export interface InviteDone {
  sentTo: string;
  /** The link the email carries, for handing over by hand while email is not set up. */
  url: string | null;
  warning: string | null;
}

export async function inviteSomeoneAction(input: InviteInput): Promise<InviteDone | SubmitFailure> {
  const member = await assertTeamMember();
  const email = input.email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };
  const inviter = { invitedBy: member.membershipId, inviterName: member.name ?? member.email };

  try {
    if (input.role === 'platform_admin') {
      const already = await queryOne<{ active: boolean }>(
        `select m.active from memberships m join profiles p on p.id = m.profile_id
          where lower(p.email) = lower($1) and m.role = 'platform_admin'`,
        [email],
      );
      if (already) return { error: already.active ? `${email} is already on the Signage.com team.` : `${email} was deactivated; reactivate them in the accounts list.` };
      const minted = await createInvitation({ brandId: null, email, role: 'platform_admin', ...inviter });
      return done(email, minted.url, null);
    }

    const brand = input.brandId
      ? await queryOne<{ id: string; slug: string; name: string }>(`select id, slug, name from brands where id = $1`, [input.brandId])
      : null;
    if (!brand) return { error: 'Choose the brand.' };

    if (input.role === 'brand_admin' || input.role === 'brand_reviewer') {
      const already = await queryOne<{ active: boolean }>(
        `select m.active from memberships m join profiles p on p.id = m.profile_id
          where lower(p.email) = lower($1) and m.brand_id = $2 and m.role = $3`,
        [email, brand.id, input.role],
      );
      if (already) return { error: already.active ? `${email} already has that role at ${brand.name}.` : `${email} was deactivated; reactivate them on ${brand.name}'s People tab.` };
      const minted = await createInvitation({ brandId: brand.id, email, role: input.role, ...inviter });
      revalidatePath(`/${brand.slug}/corporate`, 'page');
      return done(email, minted.url, minted.domainWarning);
    }

    if (input.role === 'franchisee_owner') {
      // An owner starts as a registration: the brand's welcome email carries the invitation.
      const result = await registerFranchisee({ brandId: brand.id, email, name: input.name, registeredBy: 'team' });
      revalidatePath('/admin', 'layout');
      return done(email, result.accountUrl, result.created ? null : `${email} was already registered with ${brand.name}; the welcome email was sent again.`);
    }

    if (input.role === 'franchisee_staff') {
      if (!input.franchiseeId) return { error: 'Choose the franchisee company they work for.' };
      if (input.locationIds.length === 0) return { error: 'Choose at least one store they may order for.' };
      const company = await queryOne<{ id: string }>(`select id from franchisees where id = $1 and brand_id = $2`, [input.franchiseeId, brand.id]);
      if (!company) return { error: `That company is not a ${brand.name} franchisee.` };
      const result = await inviteStaff(
        { brand: { id: brand.id, name: brand.name }, franchiseeId: company.id },
        { email, locationIds: input.locationIds, ...inviter },
      );
      if ('error' in result) return result;
      return done(email, result.url, result.warning);
    }
    return { error: 'Choose the account type.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The invitation could not be sent.' };
  }
}

function done(sentTo: string, url: string | null, warning: string | null): InviteDone {
  revalidatePath('/admin/people');
  return { sentTo, url, warning };
}

// ------------------------------------------------------------------ accounts
// What used to be Team's four controls, for every account rather than only
// Signage.com's: deactivate or reactivate, reset a lost authenticator, clear a
// lockout, withdraw an invitation. Plus the welcome resend that sat on the
// queue's registrations panel.

type Done = SubmitFailure | undefined;

async function people(fn: (member: Awaited<ReturnType<typeof assertTeamMember>>) => Promise<string | void>): Promise<Done> {
  try {
    const member = await assertTeamMember();
    const failure = await fn(member);
    if (failure) return { error: failure };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That did not work.' };
  }
  revalidatePath('/admin/people');
  return undefined;
}

/** Deactivate or reactivate any account. Takes effect on their next click. */
export async function setAccountActiveAction(membershipId: string, active: boolean): Promise<Done> {
  return people(async (member) => {
    // Nobody locks themselves out by accident; someone else has to do it.
    if (membershipId === member.membershipId) return 'You cannot deactivate yourself.';
    const changed = await query<{ id: string }>(
      `update memberships set active = $2, deactivated_at = case when $2 then null else now() end
        where id = $1 returning id`,
      [membershipId, active],
    );
    if (changed.length === 0) return 'That account no longer exists.';
  });
}

export async function resetTwoFactorAction(profileId: string): Promise<Done> {
  return people(async (member) => {
    if (profileId === member.id) return 'Ask another admin to reset your two-factor.';
    await resetTotp(profileId);
  });
}

export async function clearLockoutAction(profileId: string): Promise<Done> {
  return people(async () => {
    await clearFailedSignIns(profileId);
  });
}

export async function withdrawInvitationAction(invitationId: string): Promise<Done> {
  return people(async () => {
    await revokeInvitation(invitationId);
  });
}

/**
 * Send a franchisee's welcome email again. Deliberately keeps the same link:
 * the usual reason is "they never got it", and the first email should still
 * work if they find it later.
 */
export async function resendWelcomeAction(registrationId: string): Promise<Done> {
  return people(async () => {
    const outcome = await sendWelcomeEmail(registrationId);
    if (outcome.reason === 'not_found') return 'That registration no longer exists.';
  });
}
