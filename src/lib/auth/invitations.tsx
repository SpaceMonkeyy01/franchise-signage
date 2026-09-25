// Invitations (SPEC v2.3 §10.3.1) — the only way an account comes to exist.
//
// Minting, resolving, revoking and mailing. Accepting lives with the page that
// does it (src/app/invite/[token]/actions.ts), because acceptance starts a
// session and only a Server Action can write the cookie; this module stays free
// of `next/headers` so the bootstrap script can mint the first invitation.

import { query, queryOne } from '../db/pool';
import type { EmailBrand } from '../email/layout';
import { render } from '../email/layout';
import { sendEmail } from '../email/send';
import { brandSender, platformSender } from '../email/sender';
import { InvitationEmail } from '../email/templates/invitation';
import type { MemberRole } from './access';
import { appUrl, hashToken, mintToken } from './tokens';

export const INVITATION_TTL_DAYS = 14;

export const SIGNAGE_BRAND: EmailBrand = { name: 'Signage.com', brand_colors: null };

const ROLE_PURPOSE: Record<MemberRole, (brandName: string) => string> = {
  platform_admin: () => 'join the Signage.com operator console for Franchise by Signage',
  brand_admin: (brand) => `manage the ${brand} signage program`,
  brand_reviewer: (brand) => `review signage for ${brand}`,
  franchisee_owner: (brand) => `set up your ${brand} signage account`,
  franchisee_staff: (brand) => `help manage signage for your ${brand} store`,
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  platform_admin: 'Signage.com admin',
  brand_admin: 'Brand admin',
  brand_reviewer: 'Reviewer',
  franchisee_owner: 'Franchisee owner',
  franchisee_staff: 'Store staff',
};

export interface NewInvitation {
  brandId: string | null;
  email: string;
  role: MemberRole;
  franchiseeId?: string | null;
  locationIds?: string[];
  /** The inviter's membership; null only for the bootstrap script. */
  invitedBy: string | null;
  /** Shown in the email as who asked. Defaults to the Signage.com team. */
  inviterName?: string | null;
}

export interface MintedInvitation {
  id: string;
  url: string;
  /** Set when the address is outside the brand's approved domains (§10.7 D5). */
  domainWarning: string | null;
}

/**
 * Mint an invitation and mail it.
 *
 * Inviting the same address to the same role again replaces the earlier
 * invitation — its link stops working — which is what "re-send" means.
 */
export async function createInvitation(input: NewInvitation): Promise<MintedInvitation> {
  const email = input.email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not an email address.');
  if ((input.role === 'platform_admin') !== (input.brandId === null)) {
    throw new Error('Signage.com admins have no brand; every other role needs one.');
  }

  const brand = input.brandId
    ? await queryOne<{
        name: string;
        brand_colors: EmailBrand['brand_colors'];
        franchisee_email_domains: string[];
      }>(`select name, brand_colors, franchisee_email_domains from brands where id = $1`, [
        input.brandId,
      ])
    : null;
  if (input.brandId && !brand) throw new Error('Unknown brand.');

  await query(
    `update invitations set revoked_at = now()
      where lower(email) = lower($1) and role = $2 and brand_id is not distinct from $3
        and accepted_at is null and revoked_at is null`,
    [email, input.role, input.brandId],
  );

  const { token, hash } = mintToken();
  const row = await queryOne<{ id: string }>(
    `insert into invitations (brand_id, email, role, franchisee_id, location_ids, invited_by,
                              token_hash, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' days')::interval)
     returning id`,
    [
      input.brandId,
      email,
      input.role,
      input.franchiseeId ?? null,
      input.locationIds ?? [],
      input.invitedBy,
      hash,
      INVITATION_TTL_DAYS,
    ],
  );

  const url = appUrl(`/invite/${token}`);
  const emailBrand: EmailBrand = brand ? { name: brand.name, brand_colors: brand.brand_colors } : SIGNAGE_BRAND;
  const html = await render(
    <InvitationEmail
      brand={emailBrand}
      invitedBy={input.inviterName ?? 'The Signage.com team'}
      purpose={ROLE_PURPOSE[input.role](brand?.name ?? '')}
      acceptUrl={url}
      expiresInDays={INVITATION_TTL_DAYS}
    />,
  );
  await sendEmail({
    kind: 'invitation',
    to: email,
    subject: brand ? `You're invited to ${brand.name} signage` : 'You are invited to Franchise by Signage',
    html,
    from: brand ? brandSender(brand.name) : platformSender(),
    requestId: null,
  });

  const domains = brand?.franchisee_email_domains ?? [];
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const domainWarning =
    domains.length > 0 && !domains.some((d) => d.toLowerCase() === domain)
      ? `${domain} is not one of this brand's approved email domains (${domains.join(', ')}). The invitation was sent anyway.`
      : null;

  return { id: row!.id, url, domainWarning };
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface ResolvedInvitation {
  id: string;
  email: string;
  role: MemberRole;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  brandColors: EmailBrand['brand_colors'];
  franchiseeId: string | null;
  locationIds: string[];
  status: InvitationStatus;
  /** An account already exists for this address: accepting adds a role to it. */
  existingProfileId: string | null;
}

export async function resolveInvitation(token: string): Promise<ResolvedInvitation | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    role: MemberRole;
    brand_id: string | null;
    brand_slug: string | null;
    brand_name: string | null;
    brand_colors: EmailBrand['brand_colors'];
    franchisee_id: string | null;
    location_ids: string[];
    accepted_at: string | null;
    revoked_at: string | null;
    expired: boolean;
    profile_id: string | null;
  }>(
    `select i.id, i.email, i.role, i.brand_id, b.slug as brand_slug, b.name as brand_name,
            b.brand_colors, i.franchisee_id, i.location_ids, i.accepted_at, i.revoked_at,
            i.expires_at <= now() as expired, p.id as profile_id
       from invitations i
       left join brands b on b.id = i.brand_id
       left join profiles p on lower(p.email) = lower(i.email)
      where i.token_hash = $1`,
    [hashToken(token)],
  );
  if (!row) return null;

  const status: InvitationStatus = row.accepted_at
    ? 'accepted'
    : row.revoked_at
      ? 'revoked'
      : row.expired
        ? 'expired'
        : 'pending';

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    brandId: row.brand_id,
    brandSlug: row.brand_slug,
    brandName: row.brand_name,
    brandColors: row.brand_colors,
    franchiseeId: row.franchisee_id,
    locationIds: row.location_ids,
    status,
    existingProfileId: row.profile_id,
  };
}

export async function revokeInvitation(id: string): Promise<void> {
  await query(`update invitations set revoked_at = now() where id = $1 and accepted_at is null`, [id]);
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/** Invitations not yet accepted or revoked, for one brand or (null) for Signage.com. */
export function pendingInvitations(brandId: string | null): Promise<PendingInvitation[]> {
  return query<PendingInvitation>(
    `select id, email, role, created_at as "createdAt", expires_at as "expiresAt",
            expires_at <= now() as expired
       from invitations
      where brand_id is not distinct from $1 and accepted_at is null and revoked_at is null
      order by created_at desc`,
    [brandId],
  );
}
