// Vendor routing: approved items → one quote package per recipient (SPEC §4).
//
// The rule is per ITEM, not per request: `brand_items.vendor_policy_override ??
// brands.vendor_policy`. So a single request splits whenever its items disagree
// — the Freshbites pylon is routed to an approved vendor while everything else
// stays with Signage.com, which is exactly the case the seed exists to prove.
//
// This is the routing half of Session 5. What it deliberately does NOT do is
// send anything: `quotes.sent_at` is stamped, and composing and mailing the
// vendor package is `notifyQuotePackages`, called after this commits — a mail
// failure must not unroute a request.

import { createPgStatusStore } from './pg-status-store';
import { transaction } from './pool';
import { resolveVendorPolicy } from '../status/machine';
import { transitionRequest } from '../status/transition';
import type { VendorPolicy } from '../status/types';

export interface QuotePackagePlan extends QuotePackageDraft {
  /** The `quotes` row this package became. */
  quoteId: string;
}

interface QuotePackageDraft {
  recipientKind: VendorPolicy;
  recipientEmail: string;
  /** Who that address belongs to — used in the package email's salutation. */
  recipientName: string;
  ccEmail: string | null;
  lineItemIds: string[];
  pricedTotal: number;
  pricedCount: number;
  /** Standin-priced items: quoted by hand, never estimated (SPEC §2.1). */
  manualCount: number;
  external: boolean;
  /** Turnaround shown to the franchisee; only meaningful on the internal tail. */
  tat: string | null;
}

export interface RoutingResult {
  packages: QuotePackagePlan[];
}

interface BrandRouting {
  vendor_policy: VendorPolicy;
  vendor_name: string | null;
  vendor_email: string | null;
  corporate_cc: boolean;
  corporate_email: string | null;
  default_tat: string | null;
}

interface VendorContact {
  policy: VendorPolicy;
  vendor_name: string;
  vendor_email: string;
  corporate_cc: boolean | null;
  tat: string | null;
}

/**
 * Route an approved request and move it to `sent_for_quote`.
 *
 * Only approved items travel. Declined ones are left where they are, which is
 * the point of line-item approval: a declined add-on does not hold up the
 * package the rest of the location needs.
 */
export async function routeRequestForQuote(requestId: string): Promise<RoutingResult> {
  return transaction(async (exec) => {
    const [request] = await exec.query<{ id: string; status: string; brand_id: string }>(
      `select id, status, brand_id from requests where id = $1`,
      [requestId],
    );
    if (!request) throw new Error('Unknown request');
    if (request.status !== 'approved') {
      throw new Error(`Only an approved request can be routed (this one is ${request.status}).`);
    }

    const [brand] = await exec.query<BrandRouting>(
      `select vendor_policy, vendor_name, vendor_email, corporate_cc, corporate_email, default_tat
         from brands where id = $1`,
      [request.brand_id],
    );

    const contactRows = await exec.query<VendorContact>(
      `select policy, vendor_name, vendor_email, corporate_cc, tat
         from brand_vendor_contacts where brand_id = $1`,
      [request.brand_id],
    );
    const contacts = new Map(contactRows.map((row) => [row.policy, row]));

    const items = await exec.query<{
      id: string;
      est_price_snapshot: string | null;
      vendor_policy_override: VendorPolicy | null;
    }>(
      `select li.id, li.est_price_snapshot, bi.vendor_policy_override
         from line_items li
         join brand_items bi on bi.id = li.brand_item_id
        where li.request_id = $1 and li.item_status in ('approved', 'auto_approved')
        order by li.sort_order`,
      [requestId],
    );
    if (items.length === 0) throw new Error('There is nothing approved to route.');

    const byRecipient = new Map<VendorPolicy, QuotePackageDraft>();
    for (const item of items) {
      const { policy, tail } = resolveVendorPolicy(
        { vendorPolicy: brand.vendor_policy },
        { vendorPolicyOverride: item.vendor_policy_override },
      );

      let pkg = byRecipient.get(policy);
      if (!pkg) {
        const recipient = recipientFor(policy, brand, contacts);
        // The contact's own preference wins where it has one; otherwise the
        // brand's. `corporate_first` is never CC'd to corporate — it is already
        // going there.
        const cc = (recipient.cc ?? brand.corporate_cc) && policy !== 'corporate_first';
        pkg = {
          recipientKind: policy,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          ccEmail: cc ? brand.corporate_email : null,
          lineItemIds: [],
          pricedTotal: 0,
          pricedCount: 0,
          manualCount: 0,
          external: tail === 'external',
          tat: tail === 'external' ? null : (recipient.tat ?? brand.default_tat),
        };
        byRecipient.set(policy, pkg);
      }

      pkg.lineItemIds.push(item.id);
      if (item.est_price_snapshot === null) pkg.manualCount += 1;
      else {
        pkg.pricedCount += 1;
        pkg.pricedTotal += Number(item.est_price_snapshot);
      }
    }

    const packages: QuotePackagePlan[] = [];
    for (const pkg of byRecipient.values()) {
      const [quote] = await exec.query<{ id: string }>(
        `insert into quotes
           (request_id, recipient_kind, recipient_email, recipient_name, cc_email,
            line_item_ids, priced_total, priced_count, manual_count, external, tat, sent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         returning id`,
        [
          requestId,
          pkg.recipientKind,
          pkg.recipientEmail,
          pkg.recipientName,
          pkg.ccEmail,
          pkg.lineItemIds,
          pkg.pricedTotal,
          pkg.pricedCount,
          pkg.manualCount,
          pkg.external,
          pkg.tat,
        ],
      );
      packages.push({ ...pkg, quoteId: quote!.id });
    }

    await transitionRequest(createPgStatusStore(exec), {
      requestId,
      to: 'sent_for_quote',
      actor: 'team',
      kind: 'quote_sent',
      summary: packages
        .map(
          // Worded as docs/flow-demo.jsx:180 words it — this line is the demo's.
          (pkg) =>
            `Quote package emailed to ${pkg.recipientName} <${pkg.recipientEmail}>${
              pkg.ccEmail ? ` · cc ${pkg.ccEmail}` : ''
            } — ${pkg.pricedCount} priced item(s) $${pkg.pricedTotal.toLocaleString('en-US')}${
              pkg.manualCount ? ` + ${pkg.manualCount} manual-priced` : ''
            }`,
        )
        .join(' | '),
      detail: { packages: packages.length },
    });

    return { packages };
  });
}

/**
 * Where a package goes, and who it is addressed to.
 *
 * Resolution order for a resolved policy P (docs/DECISIONS.md #20):
 *
 *   1. the brand's `brand_vendor_contacts` row for P — the per-policy address;
 *   2. else, if P is the brand's own `vendor_policy`, the brand's single
 *      vendor_name/vendor_email, so brands configured before this table keep
 *      working unchanged;
 *   3. else, if P is `corporate_first`, corporate — they forward it themselves
 *      (SPEC §4), which is why it is a recipient and not a CC;
 *   4. else, if P is `signage_com`, the platform's own quoting address.
 *
 * With nothing matching, this THROWS rather than falling back to the brand's
 * only vendor. An item overridden to an external policy the brand has no address
 * for is a setup error, and the failure mode of guessing is mailing one vendor's
 * package — mockups, specs, prices — to a different company.
 */
function recipientFor(
  policy: VendorPolicy,
  brand: BrandRouting,
  contacts: Map<VendorPolicy, VendorContact>,
): { email: string; name: string; cc: boolean | null; tat: string | null } {
  const contact = contacts.get(policy);
  if (contact) {
    return {
      email: contact.vendor_email,
      name: contact.vendor_name,
      cc: contact.corporate_cc,
      tat: contact.tat,
    };
  }

  if (policy === brand.vendor_policy && brand.vendor_email) {
    return {
      email: brand.vendor_email,
      name: brand.vendor_name ?? 'Vendor',
      cc: null,
      tat: null,
    };
  }

  if (policy === 'corporate_first') {
    if (!brand.corporate_email) throw new Error('The brand has no corporate email to route to.');
    return { email: brand.corporate_email, name: 'Corporate', cc: null, tat: null };
  }

  if (policy === 'signage_com') {
    return {
      email: process.env.SIGNAGE_QUOTES_EMAIL ?? 'quotes@signage.com',
      name: 'Signage.com Manufacturing',
      cc: null,
      tat: null,
    };
  }

  throw new Error(
    `No vendor contact is configured for this brand's "${policy}" routing. ` +
      `Add a brand_vendor_contacts row for it before routing — the package would ` +
      `otherwise go to the wrong company.`,
  );
}
