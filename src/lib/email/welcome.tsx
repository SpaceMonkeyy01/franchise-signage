// Sending the welcome email (SPEC §8d level 1).
//
// The only outbound message in the build with no request behind it, which is the
// whole point of §8d: at agreement signing there is no location, no lease and no
// request — only a person and a brand. `sent_emails.request_id` is therefore
// null here, and the outbox at /admin/outbox is the one place it can be read back.
//
// Sent AS THE BRAND, like every other franchisee-facing message: this arrives
// days after they signed with their franchisor and weeks before they have heard
// of Signage.com, and mail from an unknown vendor at that moment reads as spam.

import { createInvitation } from '../auth/invitations';
import { brandOrigin, brandUrl } from '../auth/tokens';
import { budgetByFormat } from '../budget';
import { getRegistrationById, getRegistrationByToken } from '../db/queries';
import { query, queryOne } from '../db/pool';
import { render } from './layout';
import { brandSender } from './sender';
import { sendEmail, type SendResult } from './send';
import { WelcomeEmail } from './templates/welcome';

export interface WelcomeOutcome {
  sent: boolean;
  reason?: 'not_found';
  result?: SendResult;
  /** The email's main link: an owner invitation, or sign-in for someone who already has the role. */
  accountUrl?: string;
}

/** `/{brand_slug}/welcome/{access_token}` — the level-1 landing page. */
export function welcomeUrl(brandSlug: string, accessToken: string): string {
  return brandUrl(brandSlug, `/welcome/${accessToken}`);
}

/**
 * Send (or re-send) the welcome email for one registration.
 *
 * A brand with no standard packages still gets a message rather than silence.
 * Half the payload is missing in that case and the template drops the budget
 * block accordingly — but the franchisee has just been registered and told to
 * expect something, and a misconfigured brand must not turn into a franchisee
 * who never heard from anyone.
 */
export async function sendWelcomeEmail(registrationId: string): Promise<WelcomeOutcome> {
  const registration = await getRegistrationById(registrationId);
  if (!registration) return { sent: false, reason: 'not_found' };

  const found = await getRegistrationByToken(registration.access_token);
  if (!found) return { sent: false, reason: 'not_found' };
  const { brand } = found;

  const budgets = await budgetByFormat(brand.id);
  const account = await accountLink(registrationId, brand.id, brand.slug, registration.email);
  const html = await render(
    <WelcomeEmail
      brand={brand}
      name={registration.name}
      budgets={budgets}
      welcomeUrl={welcomeUrl(brand.slug, registration.access_token)}
      account={account}
    />,
  );

  const result = await sendEmail({
    kind: 'welcome',
    to: registration.email,
    subject: `Welcome to ${brand.name} — your signage numbers`,
    html,
    from: brandSender(brand.name),
    requestId: null,
  });

  // Stamped on "dispatched without error", not on "delivered": with no Resend
  // key nothing is ever delivered, and a timestamp that only ever fills in
  // production would make the team's "not sent yet" column useless here. A real
  // provider failure leaves it null, which is what the resend button reads.
  if (!result.error) {
    await query(`update franchisee_registrations set welcome_sent_at = now() where id = $1`, [
      registrationId,
    ]);
  }

  return { sent: !result.error, result, accountUrl: account.url };
}

/**
 * The welcome email's main button (SPEC v2.3 §10.3.1).
 *
 * Someone who already holds this brand's owner role is sent to sign in. Anyone
 * else gets a fresh owner invitation — minted each time the email goes, which
 * retires the link in any earlier copy. That is the one behaviour this changes
 * from v2.2, where a re-send kept the same link alive: an invitation creates an
 * account, and two live ones for the same person is one too many. The
 * registration's own page link (the second link) is unchanged and still works.
 */
async function accountLink(
  registrationId: string,
  brandId: string,
  brandSlug: string,
  email: string,
): Promise<{ url: string; kind: 'create' | 'sign_in' }> {
  const owner = await queryOne<{ id: string }>(
    `select m.id from memberships m join profiles p on p.id = m.profile_id
      where lower(p.email) = lower($1) and m.brand_id = $2
        and m.role = 'franchisee_owner' and m.active`,
    [email, brandId],
  );
  if (owner) return { url: `${brandOrigin(brandSlug)}/sign-in?next=/${brandSlug}`, kind: 'sign_in' };

  const invitation = await createInvitation({
    brandId,
    email,
    role: 'franchisee_owner',
    invitedBy: null,
    send: false,
  });
  await query(`update franchisee_registrations set invitation_id = $2 where id = $1`, [
    registrationId,
    invitation.id,
  ]);
  return { url: invitation.url, kind: 'create' };
}
