'use server';

// Franchisee actions on the status page.
//
// The token is re-resolved from the database on every action rather than
// trusted from the form — possession of the token is the authorization
// (SPEC §10), so it is checked at the point of use, not carried in state.

import { revalidatePath } from 'next/cache';

import { getViewer } from '@/lib/auth/access';
import { acceptQuoteAccess } from '@/lib/auth/stores';
import { toRequestFile } from '@/lib/db/create-request';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { createPgStatusStore, withStatusStore } from '@/lib/db/pg-status-store';
import type { SignDesign } from '@/lib/designs/design';
import { flaggedDesignLine, prepareResubmittedDesign } from '@/lib/designs/resubmit';
import { attachQuoteSheets } from '@/lib/designs/sheets';
import { StudioError } from '@/lib/designs/studio';
import type { DesignedItemOut } from '@/lib/designs/submit';
import { notifyReviewNeeded } from '@/lib/email/notify';
import { query, queryOne, transaction } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import { resubmitRequest, transitionPackage } from '@/lib/status';
import { CompleteError, addLeaseExhibit, addSitePhoto, setSignSize } from '@/lib/requests/complete';
import type { StoredObject } from '@/lib/storage';

/**
 * Accept ONE quote package (SPEC §9 interface 1, §6 amended v2.2).
 *
 * The one status-bearing action a franchisee takes directly, and only on an
 * internal package — an external vendor's quote is accepted off-platform and
 * the team logs it.
 *
 * The package is named by the caller, not guessed at. It used to be read back
 * as `order by created_at desc limit 1`, which is wrong twice over on a request
 * SPEC §4 split across two recipients: routing inserts every package inside one
 * transaction, and Postgres `now()` is transaction-start time, so the rows share
 * an identical `created_at` and the "latest" is an arbitrary tie-break.
 *
 * And this now MOVES only that package. Before v2.2 the request carried the
 * single fulfillment status, so accepting Signage.com's half would have dragged
 * the whole request to `accepted` and stranded the vendor half's "log order
 * placed", which is gated on quote_ready — which is why a split request was not
 * offered acceptance at all (DECISIONS #51). The request follows as the rollup.
 */
export async function acceptQuote(token: string, quoteId: string): Promise<void> {
  const request = await queryOne<{ id: string; status: string; location_id: string }>(
    `select id, status, location_id from requests where access_token = $1`,
    [token],
  );
  if (!request) throw new Error('Unknown request');

  // SPEC v2.3 §10.7 D1: the link opens this page for anyone who holds it, but
  // accepting commits money — the signed-in owner of this store, or Signage.com.
  // A forwarded link can read a quote and cannot accept it.
  if ((await acceptQuoteAccess(request.location_id)) !== 'allowed') {
    throw new Error('Only the owner of this store can accept its quote. Sign in first.');
  }

  // Scoped by request id as well as quote id: the token authorizes this request
  // and nothing else, so a quote id from elsewhere must not resolve (SPEC §10).
  const quote = await queryOne<{
    id: string;
    external: boolean;
    priced_total: string | null;
    accepted_at: string | null;
  }>(
    `select id, external, priced_total, accepted_at from quotes
      where id = $1 and request_id = $2`,
    [quoteId, request.id],
  );
  if (!quote) throw new Error('There is no quote to accept yet');
  if (quote.external) throw new Error('External quotes are accepted with the vendor directly');
  if (quote.accepted_at) throw new Error('That quote has already been accepted');

  await withStatusStore(async (store) => {
    await transitionPackage(store, {
      requestId: request.id,
      quoteId: quote.id,
      to: 'accepted',
      actor: 'franchisee',
      kind: 'quote_accepted',
      summary: 'Quote accepted by franchisee',
      detail: { total: quote.priced_total },
    });
  });

  // Their own click, so this confirms rather than informs — but it is also the
  // record of what they committed to, and where §8b a formal invoice becomes
  // available. Worth an email for both reasons.
  await notifyFranchisee(request.id, 'quote_accepted', { quoteId: quote.id });

  revalidatePath(`/[brand]/request/[token]`, 'page');
}

export interface ResubmitEdit {
  lineItemId: string;
  sizing: string | null;
  tbd: boolean;
  siteNotes: string | null;
  /** A replacement photo for this item, already in storage. */
  photo: StoredObject | null;
  /**
   * A Studio design adjusted again (SPEC v2.6 §8): null returns to the brand's
   * own, undefined leaves the line's design as it was.
   */
  design?: SignDesign | null;
}

/**
 * The franchisee answers a change request (SPEC §6, §7).
 *
 * Only the flagged items are editable and only they reopen — an approved
 * sibling is not un-approved because a different item needed work, and a
 * declined one stays declined. That rule lives in applyResubmission(); this
 * action's job is to write the edits and to refuse to touch anything else.
 */
export async function resubmitChanges(input: {
  token: string;
  edits: ResubmitEdit[];
}): Promise<SubmitFailure | undefined> {
  const request = await queryOne<{ id: string; status: string }>(
    `select id, status from requests where access_token = $1`,
    [input.token],
  );
  if (!request) return { error: 'Unknown request.' };
  if (request.status !== 'changes_requested') {
    return { error: 'There is nothing to resubmit — this request is not awaiting changes.' };
  }

  const flagged = await query<{ id: string }>(
    `select id from line_items where request_id = $1 and item_status = 'changes_requested'`,
    [request.id],
  );
  const flaggedIds = new Set(flagged.map((row) => row.id));
  if (flaggedIds.size === 0) return { error: 'No items are flagged for changes.' };
  if (input.edits.some((edit) => !flaggedIds.has(edit.lineItemId))) {
    return { error: 'That item is not one of the flagged items.' };
  }

  // Changed designs are checked against the brand's limits and priced on the
  // server, before the transaction — pricing is a ~15 s call (designs/submit.ts).
  const redesigned = new Map<string, { out: DesignedItemOut; previous: SignDesign | null }>();
  for (const edit of input.edits) {
    if (edit.design === undefined) continue;
    const line = await flaggedDesignLine(input.token, edit.lineItemId);
    if (!line) return { error: 'That sign cannot be redesigned here.' };
    try {
      redesigned.set(edit.lineItemId, {
        out: await prepareResubmittedDesign(line, edit.design, trimmed(edit.siteNotes)),
        previous: line.design,
      });
    } catch (error) {
      if (error instanceof StudioError) return { error: error.message };
      throw error;
    }
  }

  try {
    await transaction(async (exec) => {
      for (const edit of input.edits) {
        const studio = redesigned.get(edit.lineItemId);
        if (studio) {
          await applyRedesign(exec, request.id, edit.lineItemId, studio.out, studio.previous);
        } else
          await exec.query(
            `update line_items
              set sizing = $2, tbd_fields = $3, site_notes = $4
            where id = $1 and request_id = $5 and item_status = 'changes_requested'`,
            [
              edit.lineItemId,
              edit.tbd ? null : trimmed(edit.sizing),
              edit.tbd ? ['sizing'] : [],
              trimmed(edit.siteNotes),
              request.id,
            ],
          );

        if (edit.photo) {
          const file = toRequestFile('placement_photo', edit.photo);
          await exec.query(
            `insert into request_files
               (request_id, line_item_id, kind, storage_path, file_name, content_type, size_bytes)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [
              request.id,
              edit.lineItemId,
              file.kind,
              file.storagePath,
              file.fileName,
              file.contentType,
              file.sizeBytes,
            ],
          );
        }
      }

      await resubmitRequest(createPgStatusStore(exec), request.id);
    });
  } catch (error) {
    console.error('resubmission failed', error);
    return { error: 'That resubmission failed. Nothing was saved — try again.' };
  }

  // A changed design gets a fresh quote sheet; the old one was removed with it.
  // Never fatal: the resubmission is committed (as at submission, #168).
  if (redesigned.size > 0) {
    await attachQuoteSheets(request.id).catch((error) =>
      console.error('quote sheets failed', error),
    );
  }

  // The re-review email (SPEC §9 interface 3). Outside the transaction: the
  // resubmission is committed and must not be undone by a mail failure, and
  // minting the new link revokes the one the reviewer was sent for v1.
  await notifyReviewNeeded(request.id);

  revalidatePath(`/[brand]/request/[token]`, 'page');
}

type Exec = Parameters<Parameters<typeof transaction>[0]>[0];

/**
 * Write a re-priced design onto its line. The design carries the size, so the
 * sizing follows it; the old mockup and quote sheet are what corporate would
 * otherwise review, so they go (the files stay in storage, and the timeline
 * keeps the old price).
 */
async function applyRedesign(
  exec: Exec,
  requestId: string,
  lineItemId: string,
  out: DesignedItemOut,
  previous: SignDesign | null,
): Promise<void> {
  const design = out.design!;
  await exec.query(
    `update line_items
        set design = $2, est_price_snapshot = $3, price_source = $4, origin = $5,
            exception_issue = $6, site_notes = $7, sizing = $8, tbd_fields = '{}'
      where id = $1 and request_id = $9 and item_status = 'changes_requested'`,
    [
      lineItemId,
      JSON.stringify(design),
      out.estPrice,
      out.priceSource,
      out.origin,
      out.exceptionIssue,
      out.siteNotes,
      `${design.dimension.inches}" ${design.dimension.axis}`,
      requestId,
    ],
  );

  let mockupId: string | null = null;
  if (out.mockup) {
    const [row] = await exec.query<{ id: string }>(
      `insert into request_files (request_id, line_item_id, kind, storage_path, file_name, content_type)
       values ($1, $2, 'mockup', $3, $4, $5) returning id`,
      [requestId, lineItemId, out.mockup.storagePath, out.mockup.fileName, out.mockup.contentType],
    );
    mockupId = row.id;
  }
  await exec.query(`update line_items set mockup_file_id = $2 where id = $1`, [
    lineItemId,
    mockupId,
  ]);
  await exec.query(
    `delete from request_files
      where line_item_id = $1 and id is distinct from $2
        and (kind = 'quote_sheet' or (kind = 'mockup' and storage_path = $3))`,
    [lineItemId, mockupId, previous?.mockupPath ?? null],
  );

  const money = (value: number | null | undefined) =>
    value == null ? 'custom quote' : `$${value.toLocaleString('en-US')}`;
  await createPgStatusStore(exec).insertEvent({
    requestId,
    lineItemId,
    kind: 'design_changed',
    actor: 'franchisee',
    summary: `Design changed: ${design.dimension.inches}" ${design.dimension.axis} · ${money(out.estPrice)} (was ${money(previous?.price)})`,
    detail: { from: previous?.price ?? null, to: out.estPrice },
  });
}

function trimmed(value: string | null): string | null {
  const next = value?.trim();
  return next ? next : null;
}

// ------------------------------------------------- completing the package
// Until the quote, the franchisee adds what the readiness card says is still
// to follow up (DECISIONS #186). The request's link authorises it, as it does
// the change-request panel; a signed-in person is named on the timeline.

async function completer(): Promise<string> {
  const viewer = await getViewer();
  return viewer?.profile.name ?? viewer?.profile.email ?? 'The franchisee';
}

async function completing(token: string, work: (by: string) => Promise<void>): Promise<SubmitFailure | undefined> {
  try {
    await work(await completer());
  } catch (error) {
    if (error instanceof CompleteError) return { error: error.message };
    throw error;
  }
  revalidatePath('/[brand]/request/[token]', 'page');
  return undefined;
}

export async function addSitePhotoAction(token: string, lineItemId: string, file: StoredObject) {
  return completing(token, (by) => addSitePhoto(token, lineItemId, file, by));
}

export async function setSignSizeAction(token: string, lineItemId: string, sizing: string) {
  return completing(token, (by) => setSignSize(token, lineItemId, sizing, by));
}

export async function addLeaseExhibitAction(
  token: string,
  file: StoredObject | null,
  landlord: { name: string; email: string; phone: string } | null,
) {
  return completing(token, (by) => addLeaseExhibit(token, file, landlord, by));
}
