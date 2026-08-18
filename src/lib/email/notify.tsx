// What triggers mail, and what it needs to know.
//
// Kept out of src/lib/status/ on purpose: the state machine is pure and testable
// without a database, and it must stay that way. Notification is a consequence
// of a transition, not part of one — so the call sites (the team's package prep,
// the franchisee's resubmission) fire this after the transition succeeds, and a
// failed send never rolls one back.

import { getRequestById } from '../db/queries';
import { query, queryOne } from '../db/pool';
import { mintReviewLink } from '../review/links';
import { fileUrl } from '../storage/url';
import type { QuotePackagePlan } from '../db/routing';
import { render } from './layout';
import { brandSender, fromAddress, platformSender } from './sender';
import { sendEmail, type SendResult } from './send';
import { ReviewRequestedEmail, type ReviewItem } from './templates/review-requested';
import { VendorPackageEmail, type VendorPackageItem } from './templates/vendor-package';

export interface NotifyOutcome {
  sent: boolean;
  reason?: 'no_reviewer' | 'nothing_pending' | 'not_found';
  result?: SendResult;
}

/** Where a vendor replies. Never a link into the portal — see vendor-package.tsx. */
function replyToAddress(): string {
  return process.env.SIGNAGE_REPLY_EMAIL ?? fromAddress();
}

function addressLines(address: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string[] {
  const cityLine = [address.city, [address.state, address.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.line1, address.line2, cityLine].filter((line): line is string =>
    Boolean(line && line.trim()),
  );
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

/**
 * Send the quote packages a routing produced (SPEC §4, §9 interface 4).
 *
 * Called AFTER `routeRequestForQuote` commits, for the same reason
 * `notifyReviewNeeded` is called after its transition: a mail failure must not
 * unroute a request. One email per package — a request that split between
 * Signage.com and an approved vendor sends two, and neither recipient learns the
 * other exists.
 *
 * Sent as Signage.com, not as the brand. Every other template in this set goes to
 * someone inside the program, where §8d says the brand is the voice; a vendor is
 * being contracted BY Signage.com, and a quote should come from the party that
 * will be paying it.
 */
export async function notifyQuotePackages(
  requestId: string,
  packages: QuotePackagePlan[],
): Promise<NotifyOutcome[]> {
  const request = await getRequestById(requestId);
  if (!request) return [{ sent: false, reason: 'not_found' }];

  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const absolute = (path: string) => `${base}${fileUrl(path)}`;
  const outcomes: NotifyOutcome[] = [];

  for (const pkg of packages) {
    const inPackage = new Set(pkg.lineItemIds);
    const items: VendorPackageItem[] = request.items
      .filter((item) => inPackage.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.brand_item_name,
        specSummary: item.spec_summary,
        pinnedAttributes: item.pinned_attributes ?? {},
        sizing: item.sizing,
        tbdFields: item.tbd_fields,
        siteNotes: item.site_notes,
        price: item.est_price_snapshot,
        mockupUrl: (() => {
          const mockup = item.files.find((file) => file.kind === 'mockup');
          return mockup ? absolute(mockup.storage_path) : null;
        })(),
        attachments: item.files
          .filter((file) => file.kind !== 'mockup')
          .map((file) => ({ name: file.file_name ?? file.kind, url: absolute(file.storage_path) })),
      }));

    const html = await render(
      <VendorPackageEmail
        brand={request.brand}
        recipientName={pkg.recipientName}
        recipientKind={pkg.recipientKind}
        locationName={request.location.name}
        locationCode={request.location.code}
        addressLines={addressLines(request.location.address)}
        format={request.location.format}
        openingDate={request.location.opening_date}
        requestCode={request.code}
        items={items}
        requestFiles={request.files.map((file) => ({
          name: file.file_name ?? file.kind,
          kind: file.kind,
          url: absolute(file.storage_path),
        }))}
        replyTo={replyToAddress()}
        tat={pkg.tat}
        pricedTotal={pkg.pricedTotal}
        pricedCount={pkg.pricedCount}
        manualCount={pkg.manualCount}
      />,
    );

    const result = await sendEmail({
      kind: pkg.recipientKind === 'corporate_first' ? 'package_to_corporate' : 'vendor_package',
      to: pkg.recipientEmail,
      cc: pkg.ccEmail,
      // The location name already carries the brand ("Freshbites — Oak Plaza"),
      // so the brand is not repeated here.
      subject: `Quote request — ${items.length} ${items.length === 1 ? 'sign' : 'signs'}, ${request.location.name} (${request.code})`,
      html,
      from: platformSender(),
      replyTo: replyToAddress(),
      requestId,
    });

    // The timeline already says the package was emailed and to whom — that line
    // is written by the routing transition, worded as the demo words it. A second
    // event per package would only repeat it. What the timeline does NOT
    // otherwise carry is a package that failed to go out, and a team member
    // looking at a silent vendor needs to see that without opening the outbox.
    if (result.error) {
      await query(
        `insert into request_events (request_id, kind, actor, summary, detail)
         values ($1,'vendor_package_failed','system',$2,$3)`,
        [
          requestId,
          `Quote package to ${pkg.recipientName} <${pkg.recipientEmail}> did NOT send — ${result.error}. Resend it by hand.`,
          JSON.stringify({
            quoteId: pkg.quoteId,
            to: pkg.recipientEmail,
            recipientKind: pkg.recipientKind,
            emailId: result.id,
            error: result.error,
          }),
        ],
      );
    }

    outcomes.push({ sent: result.delivered, result });
  }

  return outcomes;
}
