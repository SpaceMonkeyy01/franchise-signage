// A Studio design adjusted again while answering a change request (SPEC v2.6
// §8, §7). The status page is opened by the request's link, not an account, so
// the link plus a sign corporate sent back is the authorization here — the same
// rule resubmission itself follows. SERVER ONLY.

import { queryOne } from '../db/pool';
import type { LineItemOrigin } from '../status/types';
import type { SignDesign } from './design';
import { prepareDesignedItems, type DesignedItemOut } from './submit';

export interface FlaggedDesignLine {
  id: string;
  requestId: string;
  brandId: string;
  brandSlug: string;
  brandItemId: string;
  origin: LineItemOrigin;
  design: SignDesign | null;
  siteNotes: string | null;
  exceptionIssue: string | null;
}

/**
 * The line, if this link opens a request awaiting changes and corporate sent
 * this sign back. A replacement is never designed (it matches what is up), and
 * a sign the brand has no Studio design for has nothing to adjust.
 */
export async function flaggedDesignLine(
  token: string,
  lineItemId: string,
): Promise<FlaggedDesignLine | null> {
  const row = await queryOne<{
    id: string;
    request_id: string;
    brand_id: string;
    brand_slug: string;
    brand_item_id: string;
    origin: LineItemOrigin;
    design: SignDesign | null;
    site_notes: string | null;
    exception_issue: string | null;
  }>(
    `select li.id, r.id as request_id, r.brand_id, b.slug as brand_slug, li.brand_item_id, li.origin,
            li.design, li.site_notes, li.exception_issue
       from line_items li
       join requests r on r.id = li.request_id
       join brands b on b.id = r.brand_id
       join brand_items bi on bi.id = li.brand_item_id
      where r.access_token = $1 and li.id = $2
        and r.status = 'changes_requested' and li.item_status = 'changes_requested'
        and li.origin <> 'replacement' and bi.design is not null`,
    [token, lineItemId],
  );
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    brandId: row.brand_id,
    brandSlug: row.brand_slug,
    brandItemId: row.brand_item_id,
    origin: row.origin,
    design: row.design,
    siteNotes: row.site_notes,
    exceptionIssue: row.exception_issue,
  };
}

const LIMITS_NOTE = "Outside the brand's design limits:";

/** Drop the reason a previous submission added, so a new check does not stack on it. */
function withoutLimitsNote(text: string | null): string | null {
  const kept = (text ?? '')
    .split('\n')
    .filter((line) => !line.startsWith(LIMITS_NOTE))
    .join('\n')
    .trim();
  return kept || null;
}

/**
 * Check and price the new design exactly as submission does (submit.ts): the
 * server's rules and the engine's price, never the browser's. `null` returns to
 * the brand's own design. ~15 s, so call it before any transaction.
 */
export async function prepareResubmittedDesign(
  line: FlaggedDesignLine,
  design: SignDesign | null,
  siteNotes: string | null,
): Promise<DesignedItemOut> {
  const [out] = await prepareDesignedItems(line.brandId, [
    {
      brandItemId: line.brandItemId,
      origin: line.origin,
      design,
      siteNotes: withoutLimitsNote(siteNotes),
      exceptionIssue: withoutLimitsNote(line.exceptionIssue),
    },
  ]);
  return out;
}
