// The temporary operator console — the queue.
//
// TEMPORARY. Sessions 3 and 4 replace this with /admin behind Supabase Auth and
// with signed single-use reviewer links. It exists because the franchisee flows
// (Session 2) submit real requests that nothing can currently move: package prep
// belongs to the team and approvals belong to corporate, and neither has a
// screen yet. Without it the storyline dead-ends at `submitted`.
//
// It deliberately puts both personas in one place, the way docs/flow-demo.jsx
// puts them behind one switcher — the point is to walk the whole lifecycle, not
// to model who may do what. That part comes with the real screens.

import Link from 'next/link';

import { RequestStatusChip } from '@/components/StatusChip';
import { getRequestQueue } from '@/lib/db/queries';

import { assertDevConsole } from './guard';

const INTENT_LABEL: Record<string, string> = {
  initial_setup: 'Initial setup',
  add: 'New signs',
  replace_like: 'Replacement',
  modify: 'Modification',
  remove: 'Removal',
  rebrand: 'Rebrand',
};

/** What the operator should do next, given where the request is. */
const NEXT_STEP: Record<string, string> = {
  submitted: 'Prepare the package',
  needs_review: 'Corporate decision',
  changes_requested: 'With the franchisee',
  approved: 'Route for quote',
  sent_for_quote: 'Deliver the quote',
  quote_ready: 'With the franchisee',
  accepted: 'Start production',
  in_production: 'Mark shipped',
  shipped: 'Mark installed',
  completed: '—',
};

export default async function DevQueue() {
  assertDevConsole();
  const queue = await getRequestQueue();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Banner />

      <h1 className="mt-6 text-xl font-bold text-gray-900">Request queue</h1>
      <p className="mt-1 text-sm text-gray-500">
        {queue.length} request(s). Fast-lane requests never reach corporate — they go straight from
        prep to routing.
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Request</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Next step</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/dev/request/${row.id}`} className="font-medium text-gray-900 underline-offset-2 hover:underline">
                    {row.code}
                  </Link>
                  <span className="ml-2 text-xs text-gray-400">
                    {INTENT_LABEL[row.intent] ?? row.intent}
                  </span>
                  {row.fast_lane && (
                    <span
                      className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: '#DCFCE7', color: '#166534' }}
                    >
                      ⚡ fast lane
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{row.location_name}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600">
                  {row.item_count}
                  {row.pending_count > 0 && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                      {row.pending_count} to review
                    </span>
                  )}
                  {row.changes_count > 0 && (
                    <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">
                      {row.changes_count} reopened
                    </span>
                  )}
                  {row.tbd_count > 0 && (
                    <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                      {row.tbd_count} TBD
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <RequestStatusChip status={row.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {NEXT_STEP[row.status] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export function Banner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Temporary console — Signage.com team + corporate reviewer
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
        No login, no permissions, both personas in one place. It exists so the whole storyline can
        be walked end to end before Session 3 builds the authenticated team queue and Session 4
        builds the reviewer&rsquo;s email links. Every action here calls the same status machine the
        real screens will. Not reachable in production.
      </p>
    </div>
  );
}
