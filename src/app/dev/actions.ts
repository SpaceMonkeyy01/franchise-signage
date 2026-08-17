'use server';

// The corporate reviewer's two decisions.
//
// TEMPORARY surface, permanent rules: Session 4 delivers these as signed
// single-use links in the approval email, and will call exactly these functions
// in src/lib/status/. What is missing here is only the identity — this screen
// takes anyone's word for being the reviewer, which is why ./guard.ts keeps it
// out of production.

import { revalidatePath } from 'next/cache';

import { withStatusStore } from '@/lib/db/pg-status-store';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import { decideLineItem, requestChanges } from '@/lib/status';

import { assertDevConsole } from './guard';

type Result = SubmitFailure | undefined;

async function run(fn: () => Promise<void>): Promise<Result> {
  assertDevConsole();
  try {
    await fn();
  } catch (error) {
    console.error('reviewer action failed', error);
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
  revalidatePath('/dev', 'layout');
  return undefined;
}

/** Approve or decline one item. Siblings are untouched either way (SPEC §7). */
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
      decideLineItem(store, { requestId, lineItemId, decision, note, itemLabel: item.name }),
    );
  });
}

/** Send items back to the franchisee. SPEC §7 requires the note. */
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
