// Password resets (SPEC v2.3 §10.3.3).
//
// Our own tokens rather than Supabase's recovery flow, for two reasons: the
// email goes through the same Resend pipeline (and outbox) as every other
// message, and the link is resolved here, so it works on a different device
// from the one that asked — which a PKCE recovery link does not (#108).
//
// Asking never says whether an account exists: the page answers the same
// sentence either way, so the form cannot be used to find out who has one.

import { query, queryOne } from '../db/pool';
import type { EmailBrand } from '../email/layout';
import { render } from '../email/layout';
import { sendEmail } from '../email/send';
import { brandSender, platformSender } from '../email/sender';
import { PasswordResetEmail } from '../email/templates/password-reset';
import { SIGNAGE_BRAND } from './invitations';
import { appUrl, brandOrigin, hashToken, mintToken } from './tokens';

export const RESET_TTL_MINUTES = 60;
/** More than this many requests an hour for one account sends nothing further. */
const RESETS_PER_HOUR = 3;

export async function requestPasswordReset(email: string): Promise<void> {
  const profile = await queryOne<{ id: string; email: string }>(
    `select id, email from profiles where lower(email) = lower($1)`,
    [email.trim()],
  );
  if (!profile) return;

  const recent = await queryOne<{ n: string }>(
    `select count(*) as n from password_resets
      where profile_id = $1 and created_at > now() - interval '1 hour'`,
    [profile.id],
  );
  if (Number(recent?.n ?? 0) >= RESETS_PER_HOUR) return;

  // A newer link supersedes any older one still in an inbox.
  await query(
    `update password_resets set used_at = now() where profile_id = $1 and used_at is null`,
    [profile.id],
  );
  const { token, hash } = mintToken();
  await query(
    `insert into password_resets (profile_id, token_hash, expires_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [profile.id, hash, RESET_TTL_MINUTES],
  );

  // Sent as the brand the person belongs to, or as Signage.com for the team.
  const brand = await queryOne<{ name: string; slug: string; brand_colors: EmailBrand['brand_colors'] }>(
    `select b.name, b.slug, b.brand_colors from memberships m join brands b on b.id = m.brand_id
      where m.profile_id = $1 and m.active order by m.created_at limit 1`,
    [profile.id],
  );
  const html = await render(
    <PasswordResetEmail
      brand={brand ?? SIGNAGE_BRAND}
      resetUrl={`${brand ? brandOrigin(brand.slug) : appUrl('')}/reset-password/${token}`}
      expiresInMinutes={RESET_TTL_MINUTES}
    />,
  );
  await sendEmail({
    kind: 'password_reset',
    to: profile.email,
    subject: 'Reset your password',
    html,
    from: brand ? brandSender(brand.name) : platformSender(),
    requestId: null,
  });
}

/** The profile a live reset token belongs to, or null. */
export async function resolvePasswordReset(
  token: string,
): Promise<{ resetId: string; profileId: string; email: string } | null> {
  const row = await queryOne<{ id: string; profile_id: string; email: string }>(
    `select r.id, r.profile_id, p.email
       from password_resets r join profiles p on p.id = r.profile_id
      where r.token_hash = $1 and r.used_at is null and r.expires_at > now()`,
    [hashToken(token)],
  );
  return row ? { resetId: row.id, profileId: row.profile_id, email: row.email } : null;
}

export async function markResetUsed(resetId: string): Promise<void> {
  await query(`update password_resets set used_at = now() where id = $1`, [resetId]);
}
