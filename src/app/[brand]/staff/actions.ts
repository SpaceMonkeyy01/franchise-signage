'use server';

// An owner managing their store staff (SPEC v2.3 §10.2, phase D).
//
// Invite someone to named stores, change which stores they have, deactivate or
// reactivate them, withdraw an invitation. Every action checks the owner itself
// (Server Actions are reachable by direct POST) and acts on the owner's own
// company only; the rules for what a change may touch are in src/lib/staff.ts,
// shared with the corporate People tab.

import { revalidatePath } from 'next/cache';

import { checkOwner, type OwnerAccess } from '@/lib/auth/stores';
import type { SubmitFailure } from '@/lib/forms';
import { inviteStaff, setStaffActive, setStaffStores, withdrawStaffInvitation } from '@/lib/staff';

type Result = SubmitFailure | undefined;

async function run(
  brandSlug: string,
  fn: (owner: OwnerAccess) => Promise<string | void>,
): Promise<Result> {
  const owner = await checkOwner(brandSlug);
  if ('error' in owner) return owner;
  try {
    const error = await fn(owner);
    if (error) return { error };
  } catch (error) {
    console.error('staff action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  revalidatePath(`/${brandSlug}/staff`);
  return undefined;
}

export async function inviteStaffAction(
  brandSlug: string,
  email: string,
  locationIds: string[],
): Promise<{ sentTo: string; warning: string | null } | SubmitFailure> {
  const owner = await checkOwner(brandSlug);
  if ('error' in owner) return owner;
  try {
    const result = await inviteStaff(
      { brand: owner.brand, franchiseeId: owner.franchiseeId },
      {
        email,
        locationIds,
        invitedBy: owner.membershipId,
        inviterName: owner.viewer.profile.name ?? owner.viewer.profile.email,
      },
    );
    if (!('error' in result)) revalidatePath(`/${brandSlug}/staff`);
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The invitation could not be sent.' };
  }
}

/** Replace a staff member's stores. Takes effect on their next click. */
export async function setStaffStoresAction(
  brandSlug: string,
  membershipId: string,
  locationIds: string[],
): Promise<Result> {
  return run(brandSlug, (owner) => setStaffStores(owner.franchiseeId, membershipId, locationIds));
}

export async function setStaffActiveAction(
  brandSlug: string,
  membershipId: string,
  active: boolean,
): Promise<Result> {
  return run(brandSlug, (owner) => setStaffActive(owner.franchiseeId, membershipId, active));
}

export async function withdrawStaffInvitationAction(
  brandSlug: string,
  invitationId: string,
): Promise<Result> {
  return run(brandSlug, (owner) => withdrawStaffInvitation(owner.franchiseeId, invitationId));
}
