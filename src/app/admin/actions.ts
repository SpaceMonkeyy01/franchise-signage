'use server';

// The Signage.com team's action chain (SPEC §9 interface 2).
//
// Every transition a request makes between "the franchisee submitted it" and
// "the signs are on the building" is here, and each one calls the §6 machine
// rather than touching a status column. The two tails diverge after acceptance:
// internal runs production → shipped → installed inside the portal; external
// leaves the portal entirely and the team logs what the vendor tells them.
//
// Server Actions are reachable by direct POST, so each one re-checks the team
// allowlist itself — the page guard around them is not authorization.

import { revalidatePath } from 'next/cache';

import { assertTeamMember } from '@/lib/auth/team';
import { withStatusStore } from '@/lib/db/pg-status-store';
import { query, queryOne } from '@/lib/db/pool';
import { routeRequestForQuote } from '@/lib/db/routing';
import type { SubmitFailure } from '@/lib/forms';
import { prepPackage, transitionRequest, type RequestStatus } from '@/lib/status';
import { toRequestFile } from '@/lib/db/create-request';
import type { StoredObject } from '@/lib/storage';

type Result = SubmitFailure | undefined;

/** Auth, then the work, then one shape of failure for the whole console. */
async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await assertTeamMember();
    await fn();
  } catch (error) {
    console.error('admin action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  revalidatePath('/admin', 'layout');
  return undefined;
}

/**
 * Prepare the package.
 *
 * Where the fast lane collapses: all-auto-approved goes submitted → approved in
 * one step and corporate is never emailed; anything pending lands on
 * needs_review instead. The §8b landlord check is logged either way, including
 * when no criteria were provided — "we looked and there was nothing" is the
 * answer the team needs on the record.
 */
export async function prepPackageAction(
  requestId: string,
  landlordCriteriaReviewed: 'yes' | 'no' | 'not_provided',
): Promise<Result> {
  return run(async () => {
    await withStatusStore((store) => prepPackage(store, requestId, { landlordCriteriaReviewed }));
  });
}

/** Resolve vendors and create one quote package per recipient (SPEC §4). */
export async function routeAction(requestId: string): Promise<Result> {
  return run(async () => {
    await routeRequestForQuote(requestId);
  });
}

/**
 * Price a standin item by hand (SPEC §2.1).
 *
 * Standin-priced rows have no pricing model, so they read as "Custom quote" to
 * the franchisee until a human puts a number on them. Writing the snapshot moves
 * the item out of the quote's manual count and into its total.
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
    const item = await queryOne<{ name: string }>(
      `select bi.name from line_items li
         join brand_items bi on bi.id = li.brand_item_id
        where li.id = $1 and li.request_id = $2`,
      [lineItemId, requestId],
    );
    if (!item) throw new Error('That item is not on this request.');

    await query(`update line_items set est_price_snapshot = $2 where id = $1`, [lineItemId, price]);
    await recomputeQuoteTotals(requestId);
    await logEvent(
      requestId,
      'item_priced',
      price === null
        ? `${item.name} returned to custom quote`
        : `${item.name} priced manually — $${price.toLocaleString('en-US')}`,
      { price },
      lineItemId,
    );
  });
}

/**
 * Attach a mockup to a line item.
 *
 * Manual upload is the whole mockup story in MVP: Design Studio integration is
 * Session 7 and may never arrive in this form, so `mockup_file_id` stays
 * nullable and the generic render_key thumbnail remains the fallback everywhere
 * (CLAUDE.md). Nothing blocks on a mockup existing.
 */
export async function attachMockupAction(
  requestId: string,
  lineItemId: string,
  file: StoredObject,
): Promise<Result> {
  return run(async () => {
    const item = await queryOne<{ name: string }>(
      `select bi.name from line_items li
         join brand_items bi on bi.id = li.brand_item_id
        where li.id = $1 and li.request_id = $2`,
      [lineItemId, requestId],
    );
    if (!item) throw new Error('That item is not on this request.');

    const stored = toRequestFile('mockup', file);
    const row = await queryOne<{ id: string }>(
      `insert into request_files
         (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes,
          uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,'team')
       returning id`,
      [
        requestId,
        lineItemId,
        stored.kind,
        stored.storagePath,
        stored.fileName,
        stored.contentType,
        stored.sizeBytes,
      ],
    );
    await query(`update line_items set mockup_file_id = $2 where id = $1`, [lineItemId, row!.id]);
    await logEvent(requestId, 'mockup_attached', `Mockup attached to ${item.name}`, {}, lineItemId);
  });
}

// ---------------------------------------------------------------- internal tail

/** The quote reaches the franchisee: sent_for_quote → quote_ready. */
export async function deliverQuoteAction(requestId: string): Promise<Result> {
  return run(async () => {
    const quotes = await query<{ priced_total: string | null; manual_count: number }>(
      `select priced_total, manual_count from quotes where request_id = $1`,
      [requestId],
    );
    if (quotes.length === 0) throw new Error('Route the request first — there is no quote.');

    await query(`update quotes set delivered_at = now() where request_id = $1`, [requestId]);

    const total = quotes.reduce((sum, quote) => sum + Number(quote.priced_total ?? 0), 0);
    const manual = quotes.reduce((sum, quote) => sum + quote.manual_count, 0);
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: 'quote_ready',
        actor: 'team',
        kind: 'quote_delivered',
        summary: `Quote delivered to franchisee — $${total.toLocaleString('en-US')}${
          manual > 0 ? ` + ${manual} custom item(s)` : ''
        }`,
        detail: { total, manual },
      }),
    );
  });
}

const MILESTONES: Record<string, { to: RequestStatus; kind: string; summary: string }> = {
  in_production: { to: 'in_production', kind: 'production_started', summary: 'Production started' },
  shipped: { to: 'shipped', kind: 'shipped', summary: 'Shipped' },
  completed: { to: 'completed', kind: 'installed', summary: 'Installed — location record updated' },
};

/**
 * Log a fulfillment milestone.
 *
 * `completed` is the one that matters: the ONLY transition that writes
 * installed_signs, and therefore the moment this request becomes the record every
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

// ---------------------------------------------------------------- external tail
// Fabrication happens off-platform, so these three log what the team was told
// rather than driving anything. The portal's job on this tail is to stay an
// accurate record, not to pretend it is in control.

/** The vendor came back with a number. */
export async function logExternalQuoteAction(
  requestId: string,
  total: number,
  note: string,
): Promise<Result> {
  return run(async () => {
    if (!Number.isFinite(total) || total < 0) throw new Error('That total is not a number.');

    await query(
      `update quotes set priced_total = $2, delivered_at = now()
        where request_id = $1 and external`,
      [requestId, total],
    );
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: 'quote_ready',
        actor: 'team',
        kind: 'quote_delivered',
        summary:
          `Vendor quote logged — $${total.toLocaleString('en-US')}` +
          (note.trim() ? ` · ${note.trim()}` : ''),
        detail: { total, external: true },
      }),
    );
  });
}

/** The franchisee accepted with the vendor directly; the team records it. */
export async function logExternalOrderAction(requestId: string, note: string): Promise<Result> {
  return run(async () => {
    await withStatusStore((store) =>
      transitionRequest(store, {
        requestId,
        to: 'accepted',
        actor: 'team',
        kind: 'quote_accepted',
        summary:
          'Order logged — accepted with the vendor directly' +
          (note.trim() ? ` · ${note.trim()}` : ''),
        detail: { external: true },
      }),
    );
    await query(`update quotes set accepted_at = now() where request_id = $1 and external`, [
      requestId,
    ]);
  });
}

// ------------------------------------------------------------------ §8b landlord

/** Landlord approval is TRACKED, never automated, and never promised. */
export async function logLandlordEventAction(
  requestId: string,
  outcome: 'sent' | 'approved' | 'rejected',
  note: string,
): Promise<Result> {
  return run(async () => {
    await logEvent(
      requestId,
      'landlord_approval',
      `Landlord approval ${outcome}${note.trim() ? `: ${note.trim()}` : ''}`,
      { outcome },
    );
  });
}

/** A free-text note on the record, for anything the vocabulary does not cover. */
export async function addNoteAction(requestId: string, note: string): Promise<Result> {
  return run(async () => {
    if (!note.trim()) throw new Error('An empty note is not a note.');
    await logEvent(requestId, 'note_added', note.trim(), {});
  });
}

// --------------------------------------------------------------------- helpers

async function logEvent(
  requestId: string,
  kind: string,
  summary: string,
  detail: Record<string, unknown>,
  lineItemId?: string,
): Promise<void> {
  const member = await assertTeamMember();
  await query(
    `insert into request_events (request_id, line_item_id, kind, actor, summary, detail)
     values ($1,$2,$3,'team',$4,$5)`,
    [
      requestId,
      lineItemId ?? null,
      kind,
      summary,
      JSON.stringify({ ...detail, by: member.email }),
    ],
  );
}

/**
 * Recompute a request's quote totals from its items.
 *
 * Manual pricing changes what is priced and what is still a custom quote, and
 * those are the two numbers the franchisee is looking at.
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
