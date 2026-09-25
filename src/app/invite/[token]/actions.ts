'use server';

// Accepting an invitation (SPEC v2.3 §10.3.2): the invite link IS the sign-up.
//
// Two paths, one outcome — a membership, and a session:
//
//   · new address — create the account with the password chosen here, then the
//     profile and the role. The token was mailed to this address, so the
//     address is proven and the account is created confirmed.
//   · existing account — someone who already has one (an admin invited to a
//     second brand, say) proves it with their current password, and gains the
//     role. No second account for one person.
//
// Either way it continues by role: Signage.com goes on to set up two-factor,
// which is required of it. A franchisee owner goes into store setup when the
// lease is signed, and otherwise to the §8d level-1 page — their store list,
// empty, with the budget figures and "Set up a store" (§10.3.2, §10.7 D7).
// Everyone else goes home.

import { redirect } from 'next/navigation';

import { homeFor, membershipsFor, requiresSecondFactor } from '@/lib/auth/access';
import { createAccount, deleteAccount, endSession, signInWithPassword } from '@/lib/auth/identity';
import { resolveInvitation, type ResolvedInvitation } from '@/lib/auth/invitations';
import {
  clearFailedSignIns,
  lockState,
  passwordProblem,
  recordFailedSignIn,
} from '@/lib/auth/password';
import { transaction } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';

export interface NewAccountFields {
  name: string;
  phone: string;
  companyName: string;
  password: string;
  confirm: string;
  /** Franchisee owners only: is there a signed lease on a site yet? */
  hasSite: boolean;
}

export async function acceptWithNewAccount(
  token: string,
  fields: NewAccountFields,
): Promise<SubmitFailure | undefined> {
  const invitation = await pendingInvitation(token);
  if ('error' in invitation) return invitation;
  if (invitation.existingProfileId) {
    return { error: 'An account already exists for this address. Sign in below to accept.' };
  }

  const name = fields.name.trim();
  if (!name) return { error: 'Enter your name.' };
  if (needsCompany(invitation) && !fields.companyName.trim()) {
    return { error: 'Enter your company name — the business that owns your stores.' };
  }
  const problem = passwordProblem(fields.password, invitation.email);
  if (problem) return { error: problem };
  if (fields.password !== fields.confirm) return { error: "The two passwords don't match." };

  const created = await createAccount(invitation.email, fields.password);
  if ('error' in created) {
    return {
      error:
        created.error === 'exists'
          ? 'An account already exists for this address. Sign in to accept instead.'
          : `Your account could not be created: ${created.error}`,
    };
  }

  try {
    await transaction(async (tx) => {
      await tx.query(`insert into profiles (id, email, name, phone) values ($1, $2, $3, $4)`, [
        created.userId,
        invitation.email,
        name,
        fields.phone.trim() || null,
      ]);
      await grant(tx, invitation, created.userId, fields.companyName.trim());
    });
  } catch (error) {
    // The identity exists and nothing points at it; remove it so the same
    // link can be tried again rather than failing on "already exists" forever.
    await deleteAccount(created.userId);
    throw error;
  }

  await signInWithPassword(invitation.email, fields.password);
  await continueAfterAcceptance(created.userId, invitation, fields.hasSite);
}

export async function acceptWithExistingAccount(
  token: string,
  password: string,
  hasSite: boolean,
): Promise<SubmitFailure | undefined> {
  const invitation = await pendingInvitation(token);
  if ('error' in invitation) return invitation;
  if (!invitation.existingProfileId) return { error: 'Create your account below to accept.' };

  const lock = await lockState(invitation.email);
  if (lock?.lockedUntil) return { error: 'Too many attempts. Try again later, or reset your password.' };

  const userId = await signInWithPassword(invitation.email, password);
  if (!userId || userId !== invitation.existingProfileId) {
    if (lock) await recordFailedSignIn(lock.profileId);
    if (userId) await endSession();
    return { error: "That password doesn't match this account." };
  }
  await clearFailedSignIns(userId);

  await transaction(async (tx) => grant(tx, invitation, userId, ''));
  await continueAfterAcceptance(userId, invitation, hasSite);
}

// ------------------------------------------------------------------ helpers

type Tx = Parameters<Parameters<typeof transaction>[0]>[0];

async function pendingInvitation(token: string): Promise<ResolvedInvitation | SubmitFailure> {
  const invitation = await resolveInvitation(token);
  if (!invitation) return { error: 'This invitation link is not valid.' };
  if (invitation.status === 'accepted') return { error: 'This invitation has already been accepted. Sign in instead.' };
  if (invitation.status === 'revoked') return { error: 'This invitation was withdrawn. Ask for a new one.' };
  if (invitation.status === 'expired') return { error: 'This invitation has expired. Ask for a new one.' };
  return invitation;
}

function needsCompany(invitation: ResolvedInvitation): boolean {
  return invitation.role === 'franchisee_owner' && !invitation.franchiseeId;
}

/**
 * The membership, and the invitation marked used — atomically, and only while
 * it is still pending, so two tabs racing the same link cannot both win.
 */
async function grant(
  tx: Tx,
  invitation: ResolvedInvitation,
  profileId: string,
  companyName: string,
): Promise<void> {
  const claimed = await tx.query<{ id: string }>(
    `update invitations set accepted_at = now(), accepted_profile_id = $2
      where id = $1 and accepted_at is null and revoked_at is null and expires_at > now()
      returning id`,
    [invitation.id, profileId],
  );
  if (claimed.length === 0) throw new Error('This invitation is no longer pending.');

  let franchiseeId = invitation.franchiseeId;
  if (needsCompany(invitation)) {
    const company = await tx.query<{ id: string }>(
      `insert into franchisees (brand_id, name) values ($1, $2) returning id`,
      [invitation.brandId, companyName],
    );
    franchiseeId = company[0].id;
  }

  // Re-inviting someone who once held this role reactivates it rather than
  // failing on the one-role-per-brand index.
  const existing = await tx.query<{ id: string }>(
    `select id from memberships
      where profile_id = $1 and role = $2 and brand_id is not distinct from $3`,
    [profileId, invitation.role, invitation.brandId],
  );
  let membershipId = existing[0]?.id;
  if (membershipId) {
    await tx.query(
      `update memberships set active = true, deactivated_at = null, franchisee_id = $2 where id = $1`,
      [membershipId, franchiseeId],
    );
  } else {
    const inserted = await tx.query<{ id: string }>(
      `insert into memberships (profile_id, brand_id, role, franchisee_id)
       values ($1, $2, $3, $4) returning id`,
      [profileId, invitation.brandId, invitation.role, franchiseeId],
    );
    membershipId = inserted[0].id;
  }

  for (const locationId of invitation.locationIds) {
    await tx.query(
      `insert into membership_locations (membership_id, location_id) values ($1, $2)
       on conflict do nothing`,
      [membershipId, locationId],
    );
  }
}

async function continueAfterAcceptance(
  profileId: string,
  invitation: ResolvedInvitation,
  hasSite: boolean,
): Promise<never> {
  // By id, not from the session: its cookie was set in this very request.
  const memberships = await membershipsFor(profileId);
  const destination =
    invitation.role === 'franchisee_owner' && invitation.brandSlug
      ? hasSite
        ? `/${invitation.brandSlug}/setup`
        : `/${invitation.brandSlug}`
      : invitation.brandSlug
        ? `/${invitation.brandSlug}`
        : homeFor(memberships);
  if (requiresSecondFactor(memberships)) {
    redirect(`/two-factor?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}
