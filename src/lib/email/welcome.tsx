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

import { budgetByFormat } from '../budget';
import { getRegistrationById, getRegistrationByToken } from '../db/queries';
import { query } from '../db/pool';
import { render } from './layout';
import { brandSender } from './sender';
import { sendEmail, type SendResult } from './send';
import { WelcomeEmail } from './templates/welcome';

export interface WelcomeOutcome {
  sent: boolean;
  reason?: 'not_found';
  result?: SendResult;
}

/** `/{brand_slug}/welcome/{access_token}` — the level-1 landing page. */
export function welcomeUrl(brandSlug: string, accessToken: string): string {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  return `${appUrl}/${brandSlug}/welcome/${accessToken}`;
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
  const html = await render(
    <WelcomeEmail
      brand={brand}
      name={registration.name}
      budgets={budgets}
      welcomeUrl={welcomeUrl(brand.slug, registration.access_token)}
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

  return { sent: !result.error, result };
}
