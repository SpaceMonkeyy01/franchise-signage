// The intent picker (docs/flow-demo.jsx step "intent").
//
// The first question every request answers, and the screen where the program's
// central promise is stated before anything is filled in: what happens next
// depends on WHAT you are asking for, and a like-for-like replacement of an
// already-approved sign never goes to corporate at all.
//
// modify / remove / rebrand are v1.1 (SPEC §11). Still stubbed, not hidden — a
// franchisee who needs one should see that it is coming — but as one line under
// the two that work, not three greyed-out rows that made the page look
// unfinished (owner, 7 Oct; DECISIONS #195).

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireStoreOrdering } from '@/lib/auth/stores';
import { getBrandBySlug, getInstalledSignsForLocation, getLocationById } from '@/lib/db/queries';
import { storeName } from '@/lib/format';

interface Intent {
  id: string;
  label: string;
  description: string;
  /** The approval path, stated up front. */
  rule: string;
  href?: string;
  fastLane?: boolean;
}

export default async function IntentPicker({
  params,
}: {
  params: Promise<{ brand: string; locationId: string }>;
}) {
  const { brand: slug, locationId } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const location = await getLocationById(locationId);
  if (!location || location.brand_id !== brand.id) notFound();
  // SPEC v2.3 §10.2: an owner, the staff assigned to this store, or Signage.com.
  const { viewer } = await requireStoreOrdering(
    slug,
    locationId,
    `/${slug}/location/${locationId}/request`,
  );

  const installed = await getInstalledSignsForLocation(locationId);
  const base = `/${slug}/location/${locationId}/request`;

  // Nothing installed yet means nothing to replace — the fast lane needs a
  // prior approval to reuse. Shown disabled with the reason.
  const canReplace = installed.length > 0;

  const intents: Intent[] = [
    {
      id: 'add',
      label: 'Add a new sign',
      description: `From the approved ${brand.name} catalog`,
      rule: 'Needs corporate approval',
      href: `${base}/add`,
    },
    {
      id: 'replace_like',
      label: 'Replace like-for-like',
      description: canReplace
        ? 'Damaged, faded, or worn sign'
        : 'Available once this location has installed signs on record',
      rule: 'Pre-approved — straight to quote',
      href: canReplace ? `${base}/replace` : undefined,
      fastLane: true,
    },
  ];

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}`}
        account={<AccountBadge name={viewer.profile.name} email={viewer.profile.email} />}
      />

      <main className="mx-auto w-full page-narrow flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          What does {storeName(location.name, brand.name)} need?
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          The approval path depends on what you&rsquo;re requesting — replacements of approved signs
          skip review entirely.
        </p>

        <div className="mt-6 space-y-2.5">
          {intents.map((intent) => (
            <IntentRow key={intent.id} intent={intent} />
          ))}
        </div>

        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-500" data-testid="coming-soon">
          <span className="font-medium text-gray-700">Coming soon:</span> changing a sign&rsquo;s size or
          position, removing a sign, and remodels. Until then, contact Signage.com and we&rsquo;ll set it up
          with you.
        </p>
      </main>
    </>
  );
}

function IntentRow({ intent }: { intent: Intent }) {
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--color-brand-light)' }}
        >
          <IntentIcon id={intent.id} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900">
            {intent.label}
          </span>
          <span className="block text-xs text-gray-500">{intent.description}</span>
        </span>
      </div>
      <span
        className="ml-3 shrink-0 text-right text-[11px]"
        style={{ color: intent.fastLane ? 'var(--color-brand)' : '#92400E' }}
      >
        {intent.fastLane && '⚡ '}
        {intent.rule}
      </span>
    </>
  );

  const className =
    'flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3.5 text-left';

  if (!intent.href) {
    return (
      <div
        className={`${className} cursor-not-allowed border-gray-100 opacity-50`}
        aria-disabled="true"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={intent.href}
      className={`${className} border-gray-200 transition-colors hover:border-gray-300`}
    >
      {body}
    </Link>
  );
}

/** "Freshbites — Oak Plaza" reads as "Oak Plaza" once you are already inside it. */
function IntentIcon({ id }: { id: string }) {
  const common = {
    className: 'h-4 w-4',
    fill: 'none' as const,
    stroke: 'var(--color-brand)',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 20 20',
    'aria-hidden': true,
  };

  switch (id) {
    case 'add':
      return (
        <svg {...common}>
          <path d="M10 4v12M4 10h12" />
        </svg>
      );
    case 'replace_like':
      return (
        <svg {...common}>
          <path d="M16 6a7 7 0 1 0 1.2 6" />
          <path d="M16 2.5V6h-3.5" />
        </svg>
      );
    case 'modify':
      return (
        <svg {...common}>
          <path d="M13 3.5 16.5 7 7 16.5H3.5V13Z" />
        </svg>
      );
    case 'remove':
      return (
        <svg {...common}>
          <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 16.5 12 7.5l-2-2 3.5-3.5 4.5 4.5L14.5 10l-2-2L3.5 17Z" />
        </svg>
      );
  }
}
