// Vendor routing: approved items → one quote package per recipient (SPEC §4).
//
// The rule is per ITEM, not per request: `brand_items.vendor_policy_override ??
// brands.vendor_policy`. So a single request splits whenever its items disagree
// — the Freshbites pylon is routed to an approved vendor while everything else
// stays with Signage.com, which is exactly the case the seed exists to prove.
//
// This is the routing half of Session 5. What it deliberately does NOT do is
// send anything: `quotes.sent_at` is stamped, but composing and mailing the
// vendor package is Session 5's job. Nothing here is throwaway — the temporary
// console (src/app/dev) calls it, and so will the real team queue.

import { createPgStatusStore } from './pg-status-store';
import { transaction } from './pool';
import { resolveVendorPolicy } from '../status/machine';
import { transitionRequest } from '../status/transition';
import type { VendorPolicy } from '../status/types';

export interface QuotePackagePlan {
  recipientKind: VendorPolicy;
  recipientEmail: string;
  ccEmail: string | null;
  lineItemIds: string[];
  pricedTotal: number;
  pricedCount: number;
  /** Standin-priced items: quoted by hand, never estimated (SPEC §2.1). */
  manualCount: number;
  external: boolean;
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

    const byRecipient = new Map<VendorPolicy, QuotePackagePlan>();
    for (const item of items) {
      const { policy, tail } = resolveVendorPolicy(
        { vendorPolicy: brand.vendor_policy },
        { vendorPolicyOverride: item.vendor_policy_override },
      );

      let pkg = byRecipient.get(policy);
      if (!pkg) {
        pkg = {
          recipientKind: policy,
          recipientEmail: recipientFor(policy, brand),
          ccEmail: brand.corporate_cc ? brand.corporate_email : null,
          lineItemIds: [],
          pricedTotal: 0,
          pricedCount: 0,
          manualCount: 0,
          external: tail === 'external',
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

    const packages = [...byRecipient.values()];
    for (const pkg of packages) {
      await exec.query(
        `insert into quotes
           (request_id, recipient_kind, recipient_email, cc_email, line_item_ids,
            priced_total, priced_count, manual_count, external, tat, sent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`,
        [
          requestId,
          pkg.recipientKind,
          pkg.recipientEmail,
          pkg.ccEmail,
          pkg.lineItemIds,
          pkg.pricedTotal,
          pkg.pricedCount,
          pkg.manualCount,
          pkg.external,
          pkg.external ? null : brand.default_tat,
        ],
      );
    }

    await transitionRequest(createPgStatusStore(exec), {
      requestId,
      to: 'sent_for_quote',
      actor: 'team',
      kind: 'quote_sent',
      summary: packages
        .map(
          (pkg) =>
            `Quote package emailed to ${pkg.recipientEmail}${
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
 * Where a package goes.
 *
 * `corporate_first` routes to corporate rather than a vendor — they forward it
 * themselves (SPEC §4), which is why it is a recipient and not a CC.
 *
 * KNOWN GAP (docs/DECISIONS.md #20): `brands` carries exactly ONE vendor
 * identity. A brand whose policy is signage_com but which overrides one item to
 * `approved_vendor` — the Freshbites pylon, i.e. the seeded case that exists to
 * prove the split — has no separate address for that vendor, so the package
 * falls back to the brand's single vendor contact. The routing and the split are
 * right; the address is only as good as the one column there is. §3.1 needs
 * per-policy vendor contacts before this mails anything for real (Session 5).
 */
function recipientFor(policy: VendorPolicy, brand: BrandRouting): string {
  if (policy === 'corporate_first') {
    if (!brand.corporate_email) throw new Error('The brand has no corporate email to route to.');
    return brand.corporate_email;
  }
  if (policy === 'signage_com') return brand.vendor_email ?? 'quotes@signage.com';
  if (!brand.vendor_email) throw new Error('The brand has no vendor email to route to.');
  return brand.vendor_email;
}
