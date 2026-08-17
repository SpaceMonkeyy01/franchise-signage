'use server';

// Franchisee actions on the status page.
//
// The token is re-resolved from the database on every action rather than
// trusted from the form — possession of the token is the authorization
// (SPEC §10), so it is checked at the point of use, not carried in state.

import { revalidatePath } from 'next/cache';

import { toRequestFile } from '@/lib/db/create-request';
import { createPgStatusStore, withStatusStore } from '@/lib/db/pg-status-store';
import { notifyReviewNeeded } from '@/lib/email/notify';
import { query, queryOne, transaction } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import { resubmitRequest, transitionRequest } from '@/lib/status';
import type { StoredObject } from '@/lib/storage';

/**
 * Accept a quote (SPEC §9 interface 1).
 *
 * The one status-bearing action a franchisee takes directly, and only on the
 * internal tail — an external vendor's quote is accepted off-platform and the
 * team logs it.
 */
export async function acceptQuote(token: string): Promise<void> {
  const request = await queryOne<{ id: string; status: string }>(
    `select id, status from requests where access_token = $1`,
    [token],
  );
  if (!request) throw new Error('Unknown request');

  const quote = await queryOne<{ id: string; external: boolean; priced_total: string | null }>(
    `select id, external, priced_total from quotes
      where request_id = $1 order by created_at desc limit 1`,
    [request.id],
  );
  if (!quote) throw new Error('There is no quote to accept yet');
  if (quote.external) throw new Error('External quotes are accepted with the vendor directly');

  await withStatusStore(async (store) => {
    await transitionRequest(store, {
      requestId: request.id,
      to: 'accepted',
      actor: 'franchisee',
      kind: 'quote_accepted',
      summary: 'Quote accepted by franchisee',
      detail: { quoteId: quote.id, total: quote.priced_total },
    });
  });

  await query(`update quotes set accepted_at = now() where id = $1`, [quote.id]);

  revalidatePath(`/[brand]/request/[token]`, 'page');
}

export interface ResubmitEdit {
  lineItemId: string;
  sizing: string | null;
  tbd: boolean;
  siteNotes: string | null;
  /** A replacement photo for this item, already in storage. */
  photo: StoredObject | null;
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

  try {
    await transaction(async (exec) => {
      for (const edit of input.edits) {
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

  // The re-review email (SPEC §9 interface 3). Outside the transaction: the
  // resubmission is committed and must not be undone by a mail failure, and
  // minting the new link revokes the one the reviewer was sent for v1.
  await notifyReviewNeeded(request.id);

  revalidatePath(`/[brand]/request/[token]`, 'page');
}

function trimmed(value: string | null): string | null {
  const next = value?.trim();
  return next ? next : null;
}
