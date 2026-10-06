'use server';

// One way in for every invitation the team sends (DECISIONS #190): choose the
// account type and, for everyone but a Signage.com admin, the brand — and for
// a store manager, the franchisee company and its stores. Each kind goes
// through the same function its own screen uses, so the rules (duplicates,
// one staff role per brand, the welcome email for an owner) stay in one place.

import { revalidatePath } from 'next/cache';

import { createInvitation } from '@/lib/auth/invitations';
import { assertTeamMember } from '@/lib/auth/team';
import { queryOne } from '@/lib/db/pool';
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
      if (already) return { error: already.active ? `${email} is already on the Signage.com team.` : `${email} was deactivated; reactivate them on Team.` };
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
