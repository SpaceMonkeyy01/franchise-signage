// What triggers mail, and what it needs to know.
//
// Kept out of src/lib/status/ on purpose: the state machine is pure and testable
// without a database, and it must stay that way. Notification is a consequence
// of a transition, not part of one — so the call sites (the team's package prep,
// the franchisee's resubmission) fire this after the transition succeeds, and a
// failed send never rolls one back.

import { getRequestById } from '../db/queries';
import { queryOne } from '../db/pool';
import { mintReviewLink } from '../review/links';
import { fileUrl } from '../storage/url';
import { render } from './layout';
import { brandSender } from './sender';
import { sendEmail, type SendResult } from './send';
import { ReviewRequestedEmail, type ReviewItem } from './templates/review-requested';

export interface NotifyOutcome {
  sent: boolean;
  reason?: 'no_reviewer' | 'nothing_pending' | 'not_found';
  result?: SendResult;
}

/**
 * Ask corporate to review a request (SPEC §9 interface 3).
 *
 * Called when a request lands on `needs_review` — from package prep, and again
 * from resubmission, which is the re-review email. Both mint a fresh link, and
 * minting revokes the previous one so the older email in the reviewer's inbox
 * cannot approve a package that has since changed.
 */
export async function notifyReviewNeeded(requestId: string): Promise<NotifyOutcome> {
  const request = await getRequestById(requestId);
  if (!request) return { sent: false, reason: 'not_found' };

  const pending = request.items.filter((item) => item.item_status === 'pending_review');
  if (pending.length === 0) return { sent: false, reason: 'nothing_pending' };

  // brands_public deliberately hides contact emails, so the reviewer address is
  // read from the row itself here — server-side, and never sent to a browser.
  const brand = await queryOne<{
    name: string;
    brand_colors: { primary?: string; primaryDark?: string; primaryLight?: string };
    reviewer_email: string | null;
    reviewer_email_secondary: string | null;
    review_sla_days: number;
    vendor_name: string | null;
    vendor_policy: string;
  }>(
    `select name, brand_colors, reviewer_email, reviewer_email_secondary,
            review_sla_days, vendor_name, vendor_policy
       from brands where id = (select brand_id from requests where id = $1)`,
    [requestId],
  );
  if (!brand?.reviewer_email) return { sent: false, reason: 'no_reviewer' };

  const link = await mintReviewLink(requestId, brand.reviewer_email);
  const base = process.env.APP_URL ?? 'http://localhost:3000';

  const items: ReviewItem[] = pending.map((item) => {
    const policy = item.vendor_policy_override ?? brand.vendor_policy;
    const mockup = item.files.find((file) => file.kind === 'mockup');
    return {
      id: item.id,
      name: item.brand_item_name,
      specSummary: item.spec_summary,
      origin: item.origin,
      sizing: item.sizing,
      tbdFields: item.tbd_fields,
      exceptionIssue: item.exception_issue,
      siteNotes: item.site_notes,
      price: item.est_price_snapshot,
      // Same rule the UI follows: never name the brand's vendor against a policy
      // that is not the brand's own (docs/DECISIONS.md #20).
      vendorLabel:
        policy === 'signage_com'
          ? 'Signage.com'
          : policy === brand.vendor_policy
            ? (brand.vendor_name ?? 'External vendor')
            : 'External vendor',
      // Absolute: a relative path in an email resolves against the mail client.
      mockupUrl: mockup ? `${base}${fileUrl(mockup.storage_path)}` : null,
    };
  });

  const html = await render(
    <ReviewRequestedEmail
      brand={brand}
      locationName={request.location.name}
      requestCode={request.code}
      packageVersion={request.package_version}
      autoApprovedCount={
        request.items.filter(
          (item) => item.item_status === 'auto_approved' || item.item_status === 'approved',
        ).length
      }
      items={items}
      reviewUrl={link.url}
      expiresAt={link.expiresAt}
      slaDays={brand.review_sla_days}
    />,
  );

  const resubmission = request.package_version > 1;
  const result = await sendEmail({
    kind: resubmission ? 'review_requested_again' : 'review_requested',
    to: brand.reviewer_email,
    cc: brand.reviewer_email_secondary,
    subject: resubmission
      ? `Updated: ${pending.length} sign(s) back for approval — ${request.location.name}`
      : `${pending.length} sign(s) need approval — ${request.location.name}`,
    html,
    // Sent AS the brand (SPEC §8d): the reviewer works for the franchisor, and
    // this is their own program writing to them.
    from: brandSender(brand.name),
    requestId,
  });

  await queryOne(
    `insert into request_events (request_id, kind, actor, summary, detail)
     values ($1,'review_email_sent','system',$2,$3) returning id`,
    [
      requestId,
      resubmission
        ? `Re-review email sent to corporate reviewer (package v${request.package_version})`
        : 'Approval email sent to corporate reviewer',
      JSON.stringify({ to: brand.reviewer_email, emailId: result.id, provider: result.provider }),
    ],
  );

  return { sent: result.delivered, result };
}
