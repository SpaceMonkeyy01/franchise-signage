// Reading a quote package's stage on a screen (SPEC §6, amended v2.2).
//
// `derivePackageStatus` in src/lib/status/machine.ts is the authority, and it
// takes the machine's own `PackageState` (real Dates, because it is what the
// transition helper works with). The two screens that show packages read
// `QuoteRow`, whose timestamps arrive as strings. This adapts one to the other
// rather than writing the newest-date-wins rule a second time — a second
// implementation is exactly how a screen ends up disagreeing with the machine
// about what has happened.

import type { QuoteRow } from './db/queries';
import { derivePackageStatus } from './status/machine';
import type { PackageStatus } from './status/types';

export function quoteStage(quote: QuoteRow): PackageStatus {
  return derivePackageStatus({
    id: quote.id,
    recipientName: quote.recipient_name,
    external: quote.external,
    lineItemIds: quote.line_item_ids,
    deliveredAt: quote.delivered_at ? new Date(quote.delivered_at) : null,
    acceptedAt: quote.accepted_at ? new Date(quote.accepted_at) : null,
    inProductionAt: quote.in_production_at ? new Date(quote.in_production_at) : null,
    shippedAt: quote.shipped_at ? new Date(quote.shipped_at) : null,
    completedAt: quote.completed_at ? new Date(quote.completed_at) : null,
  });
}

/** What each stage is called on screen. Operator vocabulary, not enum values. */
export const PACKAGE_STAGE_LABEL: Record<PackageStatus, string> = {
  sent_for_quote: 'Awaiting quote',
  quote_ready: 'Quoted',
  accepted: 'Accepted',
  in_production: 'In production',
  shipped: 'Shipped',
  completed: 'Installed',
};

/**
 * Who this package is with, as a franchisee would name them.
 *
 * `recipient_name` is captured at send time and is the honest answer; the
 * fallbacks exist for packages routed before that column did (Session 5).
 */
export function packageName(quote: QuoteRow, vendorName: string | null): string {
  if (quote.recipient_name) return quote.recipient_name;
  return quote.external ? (vendorName ?? 'your brand’s vendor') : 'Signage.com';
}
