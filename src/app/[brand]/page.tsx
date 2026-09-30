// The franchisee home (SPEC §9 interface 1, rewritten for v2.3 §10): "My stores".
//
// Locations are permanent entities with a record of installed signs; requests
// are events against them. That is the whole model, and this screen is where a
// franchisee sees it — every sign on their building, and every request in
// flight, in one place.
//
// Until v2.3 this page listed EVERY store of the brand to whoever opened it,
// each with its requests' private links: right for a one-franchisee pilot with
// no logins, wrong the moment a second franchisee exists. It is behind sign-in
// now and scoped to the account (src/lib/auth/access.ts `storeScope`):
//
//   signed out  — sign in; nothing about any store.
//   franchisee  — their company's stores (staff: their assigned ones). With no
//                 store yet, the §8d level-1 view: the signage number for the
//                 business plan, and "Set up a store" for when the lease is
//                 signed (§10.7 D7).
//   Signage.com — every store of the brand, said so on the page.
//   corporate   — sent to the dashboard, which shows every store (phase C).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { ReadinessCard } from '@/components/ReadinessCard';
import { SignThumbnail } from '@/components/SignThumbnail';
import { RequestStatusChip } from '@/components/StatusChip';
import { getViewer, owesSecondFactor, storeScope } from '@/lib/auth/access';
import { budgetByFormat, budgetMoney } from '@/lib/budget';
import {
  getBrandBySlug,
  getLocationsForBrand,
  type BrandPublic,
  type LocationRow,
} from '@/lib/db/queries';
import type { Readiness } from '@/lib/readiness';
import { openingLine, SETUP_STAGES, setupProgress, type SetupProgress } from '@/lib/setup-progress';

import { SignOutButton } from '../sign-in/SignOutButton';

export const dynamic = 'force-dynamic';

const INTENT_LABEL: Record<string, string> = {
  initial_setup: 'Initial setup',
  add: 'New signs',
  replace_like: 'Replacement',
  modify: 'Modification',
  remove: 'Removal',
  rebrand: 'Rebrand',
};

export default async function BrandHome({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return <SignedOut brand={brand} />;

  const scope = await storeScope(viewer, brand.id);
  // Corporate's home is the dashboard, which shows every store and more
  // (phase C). Signage.com keeps this view: it orders on a store's behalf here.
  if (scope.kind === 'all' && !scope.canOrder) redirect(`/${brand.slug}/corporate`);
  const account = <AccountBadge name={viewer.profile.name} email={viewer.profile.email} />;

  if (scope.kind === 'none') {
    return (
      <Shell brand={brand} account={account}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          You&rsquo;re signed in as {viewer.profile.email}, which has no {brand.name} account. If
          you were invited with a different address, sign out and use that one.
        </p>
        <div className="mx-auto mt-4 max-w-xs">
          <SignOutButton />
        </div>
      </Shell>
    );
  }

  const locations =
    scope.kind === 'franchisee'
      ? await getLocationsForBrand(brand.id, {
          franchiseeId: scope.franchiseeId,
          locationIds: scope.locationIds,
        })
      : await getLocationsForBrand(brand.id);

  const firstName = viewer.profile.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <Shell brand={brand} account={account}>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {scope.kind === 'all' ? (
            <>
              Every <span style={{ color: 'var(--color-brand)' }}>{brand.name}</span> store
            </>
          ) : (
            <>
              {firstName ? `${firstName}, your` : 'Your'}{' '}
              <span style={{ color: 'var(--color-brand)' }}>{brand.name}</span> stores
            </>
          )}
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-600">
          {scope.kind === 'all'
            ? 'You are viewing as Signage.com: every store of the brand, whoever owns it.'
            : scope.locationIds
              ? 'The stores your franchisee account has given you. Order signage and answer change requests here; the owner accepts quotes.'
              : 'Each store keeps a record of its installed signage — brand specs stay locked, so replacements and additions take minutes.'}
        </p>
        {scope.kind === 'franchisee' && scope.canCreateStore && (
          <Link
            href={`/${slug}/staff`}
            className="mt-3 inline-block text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-900"
          >
            Store staff — invite your managers
          </Link>
        )}
      </div>

      {locations.length === 0 ? (
        scope.kind === 'franchisee' && scope.locationIds === null ? (
          <BeforeASite brand={brand} canCreate={scope.canCreateStore} />
        ) : (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-600">
            {scope.kind === 'franchisee'
              ? 'No stores are assigned to you yet. Ask the owner of your franchisee account to add you to one.'
              : 'No stores yet.'}
          </p>
        )
      ) : (
        <div className="space-y-5">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              brandSlug={slug}
              location={location}
              canOrder={scope.canOrder}
            />
          ))}
        </div>
      )}

      {scope.canCreateStore && locations.length > 0 && (
        <Link
          href={`/${slug}/setup`}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
        >
          <StoreIcon /> Set up a new store
        </Link>
      )}
    </Shell>
  );
}

function Shell({
  brand,
  account,
  children,
}: {
  brand: BrandPublic;
  account?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} account={account} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </>
  );
}

/**
 * Signed out: the brand's landing page, and the way in.
 *
 * The first page a franchisee reaches from the welcome email or the portal
 * address, so it says what the program is before it asks for a password. It
 * still shows nothing about any store and no request link — the example card is
 * made up, and says so. There is no "start" button: accounts come only by
 * invitation (SPEC v2.3 §10), so the one action is signing in.
 */
function SignedOut({ brand }: { brand: BrandPublic }) {
  const signIn = `/sign-in?next=${encodeURIComponent(`/${brand.slug}`)}`;
  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />
      <main className="flex-1 bg-[#F7F5EF]">
        <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div>
            <p
              className="inline-block rounded-full border bg-white px-3 py-1 text-xs font-semibold"
              style={{ color: 'var(--color-brand-dark)', borderColor: 'var(--color-brand-light)' }}
            >
              {brand.name} franchise signage program
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
              Your {brand.name} signage,{' '}
              <span style={{ color: 'var(--color-brand)' }}>from agreement to install.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600">
              Order and track signage for your {brand.name} stores. Choose from the brand&rsquo;s
              approved sign packages, send the photos and landlord criteria Signage.com needs, and
              follow every sign through production to install.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={signIn}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--color-brand)' }}
              >
                Sign in
              </Link>
              <a
                href="#how-it-works"
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-400"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-gray-500">
              New to {brand.name}? Your account is created from the invitation {brand.name} emails
              you when you sign your franchise agreement. Open it to choose a password.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-white/60 p-3 shadow-sm">
            <ReadinessCard readiness={EXAMPLE_READINESS} audience="franchisee" className="" />
            <p className="px-1 pb-1 pt-2 text-[11px] text-gray-500">
              An example of a new store&rsquo;s package, as you and Signage.com see it.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-gray-200/70 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <p
              className="text-center text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-brand)' }}
            >
              How it works
            </p>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900">
              One path from signed agreement to installed signs
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {HOW_IT_WORKS(brand.name).map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col rounded-xl border border-gray-200 bg-[#FBFAF6] p-4"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: 'var(--color-brand)' }}
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-600">{step.body}</p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    You get: <span className="text-gray-800">{step.output}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-12 text-center sm:px-6">
          <h2 className="text-xl font-bold tracking-tight text-gray-900">
            Already invited? Your stores are one sign-in away.
          </h2>
          <Link
            href={signIn}
            className="mt-5 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)' }}
          >
            Sign in to {brand.name} signage
          </Link>
          <p className="mx-auto mt-5 max-w-xl text-[11px] leading-relaxed text-gray-500">
            Estimates are not quotes: final pricing and timing depend on each site. Signage.com
            keeps track of landlord approval with you, but cannot guarantee it or any permit.
          </p>
        </section>
      </main>
    </>
  );
}

// What the steps say is what the product does today, in the order a new
// franchisee meets it (SPEC §8d level 1, then level 2, then §6's tail).
function HOW_IT_WORKS(brandName: string) {
  return [
    {
      title: 'Accept your invitation',
      body: `${brandName} registers you when you sign your agreement; the email lets you choose a password.`,
      output: 'Your account',
    },
    {
      title: 'Plan the budget',
      body: 'See the signage number for each store format, ready for your business plan and lender.',
      output: 'A signage budget',
    },
    {
      title: 'Set up your store',
      body: 'Add the address, opening date and your lease sign exhibit. Anything unknown can stay TBD.',
      output: 'Your location record',
    },
    {
      title: 'Confirm your signs',
      body: `The standard package loads pre-filled. Add sizes and photos; add-ons go to ${brandName} for approval.`,
      output: 'An approved sign list',
    },
    {
      title: 'Quote to install',
      body: 'Accept the Signage.com quote and follow production to install, with the PDFs your lender asks for.',
      output: 'Signs on record',
    },
  ];
}

const EXAMPLE_READINESS: Readiness = {
  reviewReady: false,
  followUps: 2,
  rows: [
    { key: 'location', label: 'Location details', state: 'done', value: 'Received' },
    { key: 'photos', label: 'Site photos', state: 'follow_up', value: '3 of 4 signs' },
    { key: 'sizing', label: 'Sizes and site details', state: 'done', value: 'All confirmed' },
    { key: 'approvals', label: 'Approved signs', state: 'done', value: '4 of 4 approved' },
    { key: 'landlord', label: 'Landlord sign criteria', state: 'follow_up', value: 'Flagged for follow-up' },
  ],
};

/**
 * §8d level 1, for an account with no store yet (§10.7 D7): the number for the
 * business plan, and what happens when there is a site. Ordering is not hidden
 * here — only "Set up a store" leads towards it, for when the lease is signed.
 */
async function BeforeASite({ brand, canCreate }: { brand: BrandPublic; canCreate: boolean }) {
  const budgets = await budgetByFormat(brand.id);
  return (
    <div className="space-y-5">
      {budgets.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            The signage number for your business plan
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            The standard {brand.name} package at each store format, at today&rsquo;s prices. Which
            one applies depends on the site you end up with. An estimate, not a quote.
          </p>
          <ul className="mt-3 divide-y divide-gray-100">
            {budgets.map((budget) => (
              <li
                key={budget.format}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-gray-700">
                  <strong className="text-gray-900">{budget.formatLabel}</strong>
                  <span className="text-gray-400"> · {budget.packageLabel}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
                    {budgetMoney(budget.priced)}
                  </span>
                  <a
                    href={`/api/documents/budget/${brand.slug}/${budget.format}`}
                    className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
                  >
                    PDF
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">When you have a candidate site</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          At letter of intent on a specific address, {brand.name} and Signage.com produce concept
          drawings of your storefront and a site-specific budgetary quote — the pair a lender works
          from during underwriting. Tell your {brand.name} contact when you are close.
        </p>
      </section>

      {canCreate && (
        <Link
          href={`/${brand.slug}/setup`}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
        >
          <StoreIcon /> Lease signed? Set up your first store
        </Link>
      )}
    </div>
  );
}

function LocationCard({
  brandSlug,
  location,
  canOrder,
}: {
  brandSlug: string;
  location: LocationRow;
  canOrder: boolean;
}) {
  const address = [location.address.line1, location.address.city, location.address.state]
    .filter(Boolean)
    .join(', ');
  // A new store's setup, while it is under way: the tracker takes the place of
  // "setup in progress", and steps aside once the signs are installed.
  const setupRequest = location.open_requests.find((request) => request.intent === 'initial_setup');
  const progress = setupRequest ? setupProgress(setupRequest.status) : null;
  const opening = openingLine(location.opening_date);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{location.name}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <PinIcon /> {address}
          </p>
        </div>
        {canOrder && (
          <Link
            href={`/${brandSlug}/location/${location.id}/request`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)' }}
          >
            + Request signage
          </Link>
        )}
      </div>

      {progress && setupRequest && (
        <SetupTracker
          progress={progress}
          opening={opening}
          href={`/${brandSlug}/request/${setupRequest.access_token}`}
        />
      )}

      {location.installed_signs.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {location.installed_signs.map((sign) => (
            <div key={sign.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2">
              <SignThumbnail
                renderKey={sign.render_key} imagePath={sign.image_path}
                label={sign.brand_item_name}
                className="h-10 w-14 shrink-0 rounded"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{sign.brand_item_name}</p>
                <p className="truncate text-xs text-gray-500">
                  {sign.sizing ?? 'Sizing on file'} · installed{' '}
                  {new Date(sign.installed_at).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : progress ? null : (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
          Setup in progress — signs will appear here once installed.
        </p>
      )}

      {location.open_requests.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          {location.open_requests.map((request) => (
            <Link
              key={request.id}
              href={`/${brandSlug}/request/${request.access_token}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50"
            >
              <span className="text-sm" style={{ color: 'var(--color-brand-dark)' }}>
                {request.code} · {INTENT_LABEL[request.intent] ?? request.intent} ·{' '}
                {request.item_count} item(s)
              </span>
              <RequestStatusChip status={request.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** The six stages of a new store's signage, the current one marked. */
function SetupTracker({
  progress,
  opening,
  href,
}: {
  progress: SetupProgress;
  opening: string | null;
  href: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/70 p-4" data-testid="setup-tracker">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Store setup</h3>
        {opening && <span className="text-xs font-medium text-gray-600">{opening}</span>}
      </div>

      {/* Six labels do not fit a phone: there, one line names the stage. */}
      <p className="mt-2 text-xs text-gray-600 sm:hidden" aria-hidden="true">
        Step {progress.current + 1} of {SETUP_STAGES.length} ·{' '}
        <span className="font-semibold text-gray-900">{SETUP_STAGES[progress.current]}</span>
      </p>

      <ol className="mt-3 grid grid-cols-6 gap-1" aria-label="Setup stages">
        {SETUP_STAGES.map((stage, index) => {
          const done = index < progress.current;
          const current = index === progress.current;
          return (
            <li key={stage} aria-current={current ? 'step' : undefined} className="min-w-0">
              <div
                className="h-1.5 rounded-full"
                style={{
                  background: done || current ? 'var(--color-brand)' : '#e5e7eb',
                  opacity: current ? 0.55 : 1,
                }}
              />
              <p
                className={`mt-1.5 truncate text-[11px] max-sm:sr-only ${
                  current ? 'font-semibold text-gray-900' : done ? 'text-gray-700' : 'text-gray-400'
                }`}
              >
                {done && <span className="sr-only">Done: </span>}
                {current && <span className="sr-only">Now: </span>}
                {stage}
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">{progress.now}</p>
        {progress.action ? (
          <Link
            href={href}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)' }}
          >
            {progress.action}
          </Link>
        ) : (
          <Link href={href} className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-900">
            View details
          </Link>
        )}
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M3 3h14l1 4a2.5 2.5 0 0 1-4.5 1.6A2.5 2.5 0 0 1 10 9a2.5 2.5 0 0 1-3.5-.4A2.5 2.5 0 0 1 2 7l1-4Zm1 7.9V17h5v-4h2v4h5v-6.1a4 4 0 0 1-3.5-.9A4 4 0 0 1 10 11a4 4 0 0 1-2.5-1 4 4 0 0 1-3.5.9Z" />
    </svg>
  );
}
