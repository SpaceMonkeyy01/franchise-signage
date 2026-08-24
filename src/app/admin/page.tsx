// The request queue (SPEC §9 interface 2).
//
// An operator's screen, so it is organised by WHOSE MOVE IT IS rather than by
// raw status: "needs prep" is work, "with corporate" is waiting, and the
// difference is the only thing that decides what to open next. The status chip
// still shows the real §6 value — the buckets group it, they do not replace it.

import Link from 'next/link';

import { RequestStatusChip } from '@/components/StatusChip';
import { requireTeamMember } from '@/lib/auth/team';
import {
  getBrandsWithPackages,
  getRegistrations,
  getRequestQueue,
  type BrandWithFormats,
  type QueueRow,
} from '@/lib/db/queries';

import { Registrations } from './Registrations';
import type { LocationFormat, RequestStatus } from '@/lib/status/types';

const INTENT_LABEL: Record<string, string> = {
  initial_setup: 'Initial setup',
  add: 'New signs',
  replace_like: 'Replacement',
  modify: 'Modification',
  remove: 'Removal',
  rebrand: 'Rebrand',
};

interface Bucket {
  key: string;
  label: string;
  statuses: RequestStatus[] | null;
  /** True when the bucket is the team's move — the ones to work today. */
  ours?: boolean;
}

const BUCKETS: Bucket[] = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'prep', label: 'Needs prep', statuses: ['submitted'], ours: true },
  { key: 'corporate', label: 'With corporate', statuses: ['needs_review'] },
  { key: 'franchisee', label: 'With franchisee', statuses: ['changes_requested', 'quote_ready'] },
  { key: 'route', label: 'Ready to route', statuses: ['approved'], ours: true },
  {
    key: 'fulfillment',
    label: 'In fulfillment',
    statuses: ['sent_for_quote', 'accepted', 'in_production', 'shipped'],
    ours: true,
  },
  { key: 'done', label: 'Installed', statuses: ['completed'] },
];

const NEXT_STEP: Record<string, string> = {
  submitted: 'Prepare the package',
  needs_review: 'Waiting on corporate',
  changes_requested: 'Waiting on the franchisee',
  approved: 'Route for quote',
  sent_for_quote: 'Deliver / log the quote',
  quote_ready: 'Waiting on the franchisee',
  accepted: 'Start production',
  in_production: 'Mark shipped',
  shipped: 'Mark installed',
  completed: '—',
};

export default async function AdminQueue({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireTeamMember();

  const { filter } = await searchParams;
  const bucket = BUCKETS.find((entry) => entry.key === filter) ?? BUCKETS[0];

  // The counts are for every bucket, not just the open one — an operator should
  // see that four things need prep without clicking into it.
  const [all, brands, registrations] = await Promise.all([
    getRequestQueue(),
    getBrandsWithPackages(),
    getRegistrations(),
  ]);
  const shown = bucket.statuses
    ? all.filter((row) => bucket.statuses!.includes(row.status))
    : all;

  const waitingOnUs = all.filter((row) =>
    BUCKETS.filter((b) => b.ours).some((b) => b.statuses?.includes(row.status)),
  ).length;
  const pendingItems = all.reduce((sum, row) => sum + row.pending_count, 0);
  const tbdItems = all.reduce((sum, row) => sum + row.tbd_count, 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">Request queue</h1>
      <p className="mt-1 text-sm text-gray-500">
        {waitingOnUs} waiting on us · {pendingItems} item(s) with corporate · {tbdItems} TBD field(s)
        to chase.
      </p>

      <nav className="mt-5 flex flex-wrap gap-2">
        {BUCKETS.map((entry) => {
          const count = entry.statuses
            ? all.filter((row) => entry.statuses!.includes(row.status)).length
            : all.length;
          const active = entry.key === bucket.key;
          return (
            <Link
              key={entry.key}
              href={entry.key === 'all' ? '/admin' : `/admin?filter=${entry.key}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {entry.label}
              <span className={active ? 'ml-1.5 text-gray-300' : 'ml-1.5 text-gray-400'}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-gray-100 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Request</th>
              <th className="px-4 py-2.5 font-medium">Brand · location</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Next step</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <QueueLine key={row.id} row={row} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nothing in {bucket.label.toLowerCase()}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BrandDocuments brands={brands} />
      <Registrations brands={brands} registrations={registrations} />
    </main>
  );
}

const FORMAT_LABEL: Record<LocationFormat, string> = {
  inline: 'Inline',
  endcap: 'Endcap',
  freestanding: 'Freestanding',
};

/**
 * The §8b budget one-pager export.
 *
 * Lives on the team queue because SPEC §8b's real trigger is corporate, whose
 * dashboard is Session 6 — until then the team exports on their behalf. It sits
 * apart from the queue on purpose: every other control on this page acts on one
 * request, and this one is about a brand before any request exists.
 */
function BrandDocuments({ brands }: { brands: BrandWithFormats[] }) {
  const withPackages = brands.filter((brand) => brand.formats.length > 0);
  if (withPackages.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Brand documents</h2>
      <p className="mt-1 text-xs text-gray-500">
        The signage budget sheet a franchisor hands a candidate for their loan application —
        standard package prices for one location format, before any site exists. An estimate, not a
        quote.
      </p>

      <div className="mt-3 space-y-2">
        {withPackages.map((brand) => (
          <div key={brand.id} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-700">{brand.name}</span>
            {brand.formats.map((format) => (
              <a
                key={format}
                href={`/api/documents/budget/${brand.slug}/${format}`}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
              >
                {FORMAT_LABEL[format]} budget PDF
              </a>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function QueueLine({ row }: { row: QueueRow }) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-2.5">
        <Link
          href={`/admin/request/${row.id}`}
          className="font-medium text-gray-900 underline-offset-2 hover:underline"
        >
          {row.code}
        </Link>
        <span className="ml-2 text-xs text-gray-400">{INTENT_LABEL[row.intent] ?? row.intent}</span>
        {/* The fast lane is worth its own badge: it is the promise the program
            makes, and an operator seeing it knows corporate is not involved. */}
        {row.fast_lane && (
          <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
            ⚡ fast lane
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-600">
        <span className="text-xs text-gray-400">{row.brand_name}</span> · {row.location_name}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-600">
        {row.item_count}
        {row.pending_count > 0 && <Pill className="bg-amber-100 text-amber-800">{row.pending_count} to review</Pill>}
        {row.changes_count > 0 && <Pill className="bg-rose-100 text-rose-800">{row.changes_count} reopened</Pill>}
        {row.tbd_count > 0 && <Pill className="bg-gray-100 text-gray-600">{row.tbd_count} TBD</Pill>}
      </td>
      <td className="px-4 py-2.5">
        <RequestStatusChip status={row.status} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{NEXT_STEP[row.status] ?? '—'}</td>
    </tr>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 ${className}`}>{children}</span>;
}
