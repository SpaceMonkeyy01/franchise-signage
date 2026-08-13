'use server';

// Franchisee actions on the status page.
//
// The token is re-resolved from the database on every action rather than
// trusted from the form — possession of the token is the authorization
// (SPEC §10), so it is checked at the point of use, not carried in state.

import { revalidatePath } from 'next/cache';

import { withStatusStore } from '@/lib/db/pg-status-store';
import { query, queryOne } from '@/lib/db/pool';
import { transitionRequest } from '@/lib/status';

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
