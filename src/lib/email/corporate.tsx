// Sending corporate their dashboard link (SPEC §9 interface 6).
//
// Like the welcome email, this has no request behind it — `sent_emails.
// request_id` is null and /dev is where it can be read back. Unlike every other
// message in the build, the recipient asked for it a moment ago, so the send is
// synchronous with a page they are watching.
//
// The enumeration rule lives here rather than in the caller: an address that is
// not on the brand's list produces NO mail and NO error, and the page says the
// same sentence either way. Whether a particular person is a franchisor's
// signage reviewer is theirs to disclose, not this form's.

import { queryOne } from '../db/pool';
import { getBrandBySlug } from '../db/queries';
import {
  CORPORATE_LINK_TTL_DAYS,
  findBrandRecipient,
  mintCorporateLink,
} from '../corporate/links';
import { render } from './layout';
import { brandSender } from './sender';
import { sendEmail } from './send';
import { CorporateLinkEmail } from './templates/corporate-link';

export interface CorporateLinkOutcome {
  /** True when an address matched and a link was sent. Never shown to the requester. */
  sent: boolean;
  reason?: 'not_on_file' | 'brand_unknown' | 'throttled';
}

/**
 * A second request inside this window re-sends nothing.
 *
 * The form is public and its recipient list is fixed, so the worst it can do is
 * mail the same three people repeatedly — which is exactly what a double-click,
 * an impatient second press, or someone bored would produce. The link already in
 * their inbox still works, so there is nothing to gain by minting another.
 */
const RESEND_COOLDOWN_SECONDS = 120;

/**
 * Issue and send a dashboard link, if the address is entitled to one.
 *
 * `renewal` is decided by whether the brand has ever issued this person a link
 * before, which only changes one word of the subject line — but "here is
 * another" and "here is your" read very differently to someone who did not
 * expect the message.
 */
export async function sendCorporateLink(
  brandSlug: string,
  email: string,
): Promise<CorporateLinkOutcome> {
  const recipient = await findBrandRecipient(brandSlug, email);
  if (!recipient) return { sent: false, reason: 'not_on_file' };

  // The public view, not the row: the template only needs the co-branding, and
  // the row carries three contact addresses it has no business holding.
  const brand = await getBrandBySlug(recipient.brandSlug);
  if (!brand) return { sent: false, reason: 'brand_unknown' };

  if (await sentRecently(recipient.brandId, recipient.email)) {
    return { sent: false, reason: 'throttled' };
  }

  const previous = await hasEarlierLink(recipient.brandId, recipient.email);
  const link = await mintCorporateLink(recipient.brandId, recipient.email);

  const html = await render(
    <CorporateLinkEmail
      brand={brand}
      dashboardUrl={link.url}
      expiresInDays={CORPORATE_LINK_TTL_DAYS}
      renewal={previous}
    />,
  );

  await sendEmail({
    kind: 'corporate_dashboard_link',
    to: recipient.email,
    subject: `Your ${brand.name} signage dashboard`,
    html,
    from: brandSender(brand.name),
    requestId: null,
  });

  return { sent: true };
}

async function hasEarlierLink(brandId: string, email: string): Promise<boolean> {
  const row = await queryOne<{ count: string }>(
    `select count(*) as count from corporate_links where brand_id = $1 and email = $2`,
    [brandId, email.toLowerCase()],
  );
  return Number(row?.count ?? 0) > 0;
}

async function sentRecently(brandId: string, email: string): Promise<boolean> {
  const row = await queryOne<{ count: string }>(
    `select count(*) as count from corporate_links
      where brand_id = $1 and email = $2 and revoked_at is null
        and created_at > now() - ($3 || ' seconds')::interval`,
    [brandId, email.toLowerCase(), RESEND_COOLDOWN_SECONDS],
  );
  return Number(row?.count ?? 0) > 0;
}
