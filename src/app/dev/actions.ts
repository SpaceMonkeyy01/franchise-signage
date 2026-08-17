'use server';

// Every privileged action in the system, in one temporary place.
//
// These are the transitions the Signage.com team and the corporate reviewer
// perform. Sessions 3 and 4 give them their real homes — an authenticated queue
// and signed single-use email links — but the RULES they call are already the
// permanent ones in src/lib/status/, so what moves here is the surface, not the
// behaviour.
//
// Nothing here checks who is asking. See ./guard.ts for why that is survivable
// and how it is contained.

import { revalidatePath } from 'next/cache';

import { withStatusStore } from '@/lib/db/pg-status-store';
import { query, queryOne } from '@/lib/db/pool';
import { routeRequestForQuote } from '@/lib/db/routing';
import {
  decideLineItem,
  prepPackage,
  requestChanges,
  transitionRequest,
  type RequestStatus,
} from '@/lib/status';
import type { SubmitFailure } from '@/lib/forms';

import { assertDevConsole } from './guard';

type Result = SubmitFailure | undefined;

/** Everything here reports failure the same way the franchisee actions do. */
async function run(fn: () => Promise<void>): Promise<Result> {
  assertDevConsole();
  try {
    await fn();
  } catch (error) {
    console.error('dev console action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  revalidatePath('/dev', 'layout');
  return undefined;
}

// ------------------------------------------------------------ Signage.com team

/**
 * Prepare the package — the step that has been missing.
 *
 * This is where the fast lane collapses: every item auto-approved means
 * submitted → approved in one move and corporate is never emailed. Otherwise it
 * lands on needs_review and Session 4's mail goes out.
 */
export async function prepPackageAction(
  requestId: string,
  landlordCriteriaReviewed?: 'yes' | 'no' | 'not_provided',
): Promise<Result> {
  return run(async () => {
    await withStatusStore((store) =>
      prepPackage(store, requestId, { landlordCriteriaReviewed }),
    );
  });
}

/** Resolve vendors and create the quote packages (SPEC §4). */
export async function routeAction(requestId: string): Promise<Result> {
  return run(async () => {
    await routeRequestForQuote(requestId);
  });
}

/**
 * Price a standin item by hand (SPEC §2.1).
 *
 * Standin-priced items have no pricing model and read as "Custom quote" to the
 * franchisee until someone puts a number on them. Writing the snapshot also
 * moves the item from the quote's manual count into its priced total.
 */
export async function priceItemAction(
  requestId: string,
  lineItemId: string,
  price: number | null,
): Promise<Result> {
  return run(async () => {
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      throw new Error('That price is not a number.');
    }
    const item = await queryOne<{ id: string; name: string }>(
      `select li.id, bi.name from line_items li
         join brand_items bi on bi.id = li.brand_item_id
        where li.id = $1 and li.request_id = $2`,
      [lineItemId, requestId],
    );
    if (!item) throw new Error('That item is not on this request.');

    await query(`update line_items set est_price_snapshot = $2 where id = $1`, [lineItemId, price]);
    await recomputeQuoteTotals(requestId);
    await query(
      `insert into request_events (request_id, line_item_id, kind, actor, summary, detail)
       values ($1,$2,'item_priced','team',$3,$4)`,
      [
        requestId,
        lineItemId,
        price === null
          ? `${item.name} returned to custom quote`
          : `${item.name} priced manually — $${price.toLocaleString('en-US')}`,
        JSON.stringify({ price }),
      ],
    );
  });
}

/** The quote reaches the franchisee: sent_for_quote → quote_ready. */
export async function deliverQuoteAction(requestId: string): Promise<Result> {
  return run(async () => {
    const quotes = await query<{ id: string; priced_total: string | null; external: boolean }>(
      `select id, priced_total, external from quotes where request_id = $1`,
      [requestId],
    );
    if (quotes.length === 0) throw new Error('Route the request first — there is no quote.');

    await query(`update quotes set delivered_at = now() where request_id = $1`, [requestId]);

    const total = quotes.reduce((sum, quote) => sum + Number(quote.priced_total ?? 0), 0);
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: 'quote_ready',
        actor: 'team',
        kind: 'quote_delivered',
        summary: `Quote delivered to franchisee — $${total.toLocaleString('en-US')}`,
        detail: { total },
      }),
    );
  });
}

const MILESTONES: Record<string, { to: RequestStatus; kind: string; summary: string }> = {
  in_production: { to: 'in_production', kind: 'production_started', summary: 'Production started' },
  shipped: { to: 'shipped', kind: 'shipped', summary: 'Shipped' },
  completed: {
    to: 'completed',
    kind: 'installed',
    summary: 'Installed — location record updated',
  },
};

/**
 * Log a fulfillment milestone.
 *
 * `completed` is the one that matters: it is the ONLY transition that writes
 * installed_signs, and it is what turns this request into the record every
 * future request reads from.
 */
export async function milestoneAction(
  requestId: string,
  milestone: keyof typeof MILESTONES,
): Promise<Result> {
  return run(async () => {
    const step = MILESTONES[milestone];
    if (!step) throw new Error('Unknown milestone.');
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: step.to,
        actor: 'team',
        kind: step.kind,
        summary: step.summary,
      }),
    );
  });
}

/**
 * Accept on the franchisee's behalf, for the external tail.
 *
 * An external vendor's quote is accepted off-platform, so the team logs it —
 * unlike the internal tail, where the franchisee presses the button themselves.
 */
export async function logAcceptanceAction(requestId: string): Promise<Result> {
  return run(async () => {
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: 'accepted',
        actor: 'team',
        kind: 'quote_accepted',
        summary: 'Acceptance logged by the Signage.com team (agreed with the vendor directly)',
      }),
    );
    await query(`update quotes set accepted_at = now() where request_id = $1`, [requestId]);
  });
}

/** §8b: landlord approval is tracked by hand, never automated. */
export async function logLandlordEventAction(
  requestId: string,
  outcome: 'sent' | 'approved' | 'rejected',
  note: string,
): Promise<Result> {
  return run(async () => {
    await query(
      `insert into request_events (request_id, kind, actor, summary, detail)
       values ($1,'landlord_approval','team',$2,$3)`,
      [
        requestId,
        `Landlord approval ${outcome}${note.trim() ? `: ${note.trim()}` : ''}`,
        JSON.stringify({ outcome }),
      ],
    );
  });
}

// ------------------------------------------------------------------- corporate

export async function decideItemAction(
  requestId: string,
  lineItemId: string,
  decision: 'approved' | 'declined',
  note: string,
): Promise<Result> {
  return run(async () => {
    const item = await queryOne<{ name: string }>(
      `select bi.name from line_items li
         join brand_items bi on bi.id = li.brand_item_id
        where li.id = $1 and li.request_id = $2`,
      [lineItemId, requestId],
    );
    if (!item) throw new Error('That item is not on this request.');

    await withStatusStore((store) =>
      decideLineItem(store, {
        requestId,
        lineItemId,
        decision,
        note,
        itemLabel: item.name,
      }),
    );
  });
}

/** Request changes on one item. SPEC §7 requires the note. */
export async function requestChangesAction(
  requestId: string,
  lineItemIds: string[],
  comment: string,
): Promise<Result> {
  return run(async () => {
    if (lineItemIds.length === 0) throw new Error('Pick at least one item to send back.');
    await withStatusStore((store) => requestChanges(store, requestId, lineItemIds, comment));
  });
}

// --------------------------------------------------------------------- helpers

/**
 * Recompute a request's quote totals from its items.
 *
 * Manual pricing changes what is priced and what is still a custom quote, and
 * the franchisee is looking at those two numbers on the status page.
 */
async function recomputeQuoteTotals(requestId: string): Promise<void> {
  await query(
    `update quotes q
        set priced_total = totals.priced_total,
            priced_count = totals.priced_count,
            manual_count = totals.manual_count
       from (
         select q2.id,
                coalesce(sum(li.est_price_snapshot), 0) as priced_total,
                count(li.id) filter (where li.est_price_snapshot is not null)::int as priced_count,
                count(li.id) filter (where li.est_price_snapshot is null)::int as manual_count
           from quotes q2
           left join line_items li on li.id = any(q2.line_item_ids)
          where q2.request_id = $1
          group by q2.id
       ) as totals
      where q.id = totals.id`,
    [requestId],
  );
}
