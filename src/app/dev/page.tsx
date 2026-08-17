// The corporate reviewer stand-in — the queue of things waiting on corporate.
//
// TEMPORARY, and now narrower than it was: the Signage.com team's half moved to
// /admin when Session 3 built it for real. What is left is the reviewer, because
// Session 4 delivers their decisions as signed single-use links in an approval
// email and that does not exist yet. Without this screen a request that needs
// corporate cannot move at all.
//
// Delete this route when Session 4 lands. Do not secure it — see ./guard.ts.

import Link from 'next/link';

import { RequestStatusChip } from '@/components/StatusChip';
import { getRequestQueue } from '@/lib/db/queries';

import { assertDevConsole } from './guard';

export default async function DevReviewerQueue() {
  assertDevConsole();
  // Exactly what a reviewer would be emailed about: requests with items pending
  // their decision. Nothing else on the queue is theirs to act on.
  const waiting = await getRequestQueue(['needs_review']);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Banner />

      <h1 className="mt-6 text-xl font-bold text-gray-900">Awaiting corporate approval</h1>
      <p className="mt-1 text-sm text-gray-500">
        {waiting.length} request(s). Only add-ons and exceptions reach this list — standard package
        items and like-for-like replacements auto-approve and never appear.
      </p>

      <div className="mt-5 space-y-2">
        {waiting.map((row) => (
          <Link
            key={row.id}
            href={`/dev/request/${row.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-300"
          >
            <span className="text-sm">
              <span className="font-medium text-gray-900">{row.code}</span>
              <span className="ml-2 text-gray-500">
                {row.brand_name} · {row.location_name}
              </span>
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                {row.pending_count} to review
              </span>
            </span>
            <RequestStatusChip status={row.status} />
          </Link>
        ))}
        {waiting.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
            Nothing is waiting on corporate.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Looking for the Signage.com side?{' '}
        <Link href="/admin" className="underline underline-offset-2">
          The operator console is at /admin
        </Link>
        .
      </p>
    </main>
  );
}

export function Banner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Temporary reviewer stand-in — corporate approvals
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
        No login and no identity: this is a stand-in for the approval email Session 4 sends, whose
        Approve / Request changes / Decline actions are signed single-use links. The decisions it
        records are real and go through the same §7 rules. Not reachable in production.
      </p>
    </div>
  );
}
