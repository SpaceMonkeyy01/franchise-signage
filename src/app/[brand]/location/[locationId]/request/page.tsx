// The intent picker (docs/flow-demo.jsx step "intent").
//
// The first question every request answers, and the screen where the program's
// central promise is stated before anything is filled in: what happens next
// depends on WHAT you are asking for, and a like-for-like replacement of an
// already-approved sign never goes to corporate at all.
//
// modify / remove / rebrand are v1.1 (SPEC §11). They are shown disabled rather
// than hidden, exactly as the demo shows them — a franchisee who needs one
// should see that it is coming, not conclude the portal cannot do it.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { getBrandBySlug, getInstalledSignsForLocation, getLocationById } from '@/lib/db/queries';

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
    {
      id: 'modify',
      label: 'Modify an existing sign',
      description: 'Different size, spec, or position',
      rule: 'Corporate reviews the change',
    },
    {
      id: 'remove',
      label: 'Remove a sign',
      description: 'Take down an installed sign',
      rule: 'Logged; review per brand policy',
    },
    {
      id: 'rebrand',
      label: 'Remodel / rebrand',
      description: 'Update to new brand standards',
      rule: 'Diffed against current package',
    },
  ];

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} backHref={`/${slug}`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          What does {shortName(location.name)} need?
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
            {!intent.href && !intent.fastLane && (
              <span className="ml-1 text-[10px] font-normal text-gray-400">· coming in v1.1</span>
            )}
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
function shortName(name: string): string {
  return name.split('—').pop()?.trim() || name;
}

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
