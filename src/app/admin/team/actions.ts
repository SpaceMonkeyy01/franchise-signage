'use server';

// Managing the Signage.com team (SPEC v2.3 §10.2): invite, deactivate,
// reactivate, reset a lost authenticator, clear a lockout. Every action checks
// the caller itself — Server Actions are reachable by direct POST.

import { revalidatePath } from 'next/cache';

import { resetTotp } from '@/lib/auth/identity';
import { createInvitation, revokeInvitation } from '@/lib/auth/invitations';
import { clearFailedSignIns } from '@/lib/auth/password';
import { assertTeamMember } from '@/lib/auth/team';
import { query, queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';

export async function inviteTeamMember(
  email: string,
): Promise<{ sentTo: string } | SubmitFailure> {
  const member = await assertTeamMember();

  const already = await queryOne<{ active: boolean }>(
    `select m.active from memberships m join profiles p on p.id = m.profile_id
      where lower(p.email) = lower($1) and m.role = 'platform_admin'`,
    [email.trim()],
  );
  if (already?.active) return { error: `${email.trim()} is already on the team.` };
  if (already) return { error: `${email.trim()} was deactivated. Reactivate them below instead.` };

  try {
    await createInvitation({
      brandId: null,
      email,
      role: 'platform_admin',
      invitedBy: member.membershipId,
      inviterName: member.name ?? member.email,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The invitation could not be sent.' };
  }
  revalidatePath('/admin/team');
  return { sentTo: email.trim() };
}

export async function setTeamMemberActive(membershipId: string, active: boolean): Promise<void> {
  const member = await assertTeamMember();
  // Nobody locks themselves out by accident; someone else has to do it.
  if (membershipId === member.membershipId) throw new Error('You cannot deactivate yourself.');
  await query(
    `update memberships set active = $2, deactivated_at = case when $2 then null else now() end
      where id = $1 and role = 'platform_admin'`,
    [membershipId, active],
  );
  revalidatePath('/admin/team');
}

export async function resetTeamMemberTwoFactor(profileId: string): Promise<void> {
  const member = await assertTeamMember();
  if (profileId === member.id) throw new Error('Ask another admin to reset your two-factor.');
  await resetTotp(profileId);
  revalidatePath('/admin/team');
}

export async function clearTeamMemberLockout(profileId: string): Promise<void> {
  await assertTeamMember();
  await clearFailedSignIns(profileId);
  revalidatePath('/admin/team');
}

export async function withdrawInvitation(invitationId: string): Promise<void> {
  await assertTeamMember();
  await revokeInvitation(invitationId);
  revalidatePath('/admin/team');
}
