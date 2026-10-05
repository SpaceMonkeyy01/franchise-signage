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
import { CursorGlow } from '@/components/CursorGlow';

import { SignThumbnail, signImageUrl } from '@/components/SignThumbnail';
import { ExpandChevron, RequestSignList, SignStrip } from '@/components/RequestSigns';
import { RequestStatusChip } from '@/components/StatusChip';
import { getViewer, owesSecondFactor, storeScope } from '@/lib/auth/access';
import { budgetByFormat, budgetMoney } from '@/lib/budget';
import {
  getBrandBySlug,
  getLocationsForBrand,
  getShowcaseSigns,
  type BrandPublic,
  type LocationRow,
  type ShowcaseSign,
} from '@/lib/db/queries';
import type { Readiness, ReadinessState } from '@/lib/readiness';
import { openingLine, SETUP_STAGES, storeProgress, type SetupProgress } from '@/lib/setup-progress';

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
  if (!viewer || owesSecondFactor(viewer)) {
    return <SignedOut brand={brand} signs={await getShowcaseSigns(brand.id)} />;
  }

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
              canEdit={scope.canCreateStore}
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
      <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </>
  );
}

/**
 * Signed out: the brand's landing page, and the way in.
 *
 * The first page a franchisee reaches from the welcome email or the portal
 * address, so it says what the program is before it asks for a password. It
 * shows the brand's own signs — pictures and names, never prices — and nothing
 * about any store; the readiness card is made up, and says so. There is no
 * "start" button: accounts come only by invitation (SPEC v2.3 §10), so the one
 * action is signing in.
 */
function SignedOut({ brand, signs }: { brand: BrandPublic; signs: ShowcaseSign[] }) {
  const signIn = `/sign-in?next=${encodeURIComponent(`/${brand.slug}`)}`;
  const [featured, ...others] = signs;
  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} account={<HeaderSignIn href={signIn} />} />
      <main className="relative flex-1">
        <CursorGlow />
        <section className="mx-auto grid grid-cols-1 w-full page-wide items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.05fr_1fr] md:py-16">
          <div>
            <p
              className="inline-block rounded-full border bg-white px-3 py-1 text-xs font-semibold"
              style={{ color: 'var(--color-brand-dark)', borderColor: 'var(--color-brand-light)' }}
            >
              {brand.name} franchise signage
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
              Signage for your{' '}
              <span style={{ color: 'var(--color-brand)' }}>{brand.name} store</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
              {brand.name} has approved a standard set of signs, and Signage.com makes and installs
              them. Choose the signs for your store, adjust sizes to suit your site, and follow your
              order through production and installation.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={signIn}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--color-brand)' }}
              >
                Sign in
              </Link>
              <a
                href={signs.length > 0 ? '#signs' : '#how-it-works'}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-400"
              >
                {signs.length > 0 ? 'See the signs' : 'See how it works'}
              </a>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-gray-500">
              Don&rsquo;t have an account yet? {brand.name} will email you an invitation when you
              sign your franchise agreement.
            </p>
          </div>

          {featured ? (
            <HeroSigns brand={brand} featured={featured} others={others.slice(0, 3)} />
          ) : (
            <ExampleStore brand={brand} signs={signs} />
          )}
        </section>

        <section className="border-t border-gray-200/70 bg-white">
          <div className="mx-auto grid w-full page-wide grid-cols-1 gap-4 px-4 py-14 sm:px-6 md:grid-cols-3">
            {WHAT_YOU_GET(brand.name).map((point) => (
              <div key={point.title} className="rounded-xl border border-gray-200 bg-[#FBFAF6] p-5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ background: 'var(--color-brand)' }}
                  aria-hidden
                >
                  {point.icon}
                </span>
                <h2 className="mt-3 text-base font-semibold text-gray-900">{point.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{point.body}</p>
              </div>
            ))}
          </div>
        </section>

        {signs.length > 0 && (
          <section id="signs" className="mx-auto w-full page-wide scroll-mt-6 px-4 py-14 sm:px-6">
            <Eyebrow>Sign catalog</Eyebrow>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              The {brand.name} sign catalog
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-relaxed text-gray-600">
              Signs marked &ldquo;Standard package&rdquo; are included for your store type and
              approved automatically. You can add others, which {brand.name} reviews before they are
              ordered.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {signs.map((sign) => (
                <li key={sign.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="relative aspect-square bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signImageUrl(sign.image_path)}
                      alt={sign.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {sign.in_package && (
                      <span
                        className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold shadow-sm"
                        style={{ color: 'var(--color-brand-dark)' }}
                      >
                        Standard package
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-snug text-gray-900">
                      {signName(sign.name, brand.name)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {sign.sign_type} · {sign.placement === 'indoor' ? 'Indoor' : 'Outdoor'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="how-it-works" className="scroll-mt-6 border-t border-gray-200/70 bg-white">
          <div className="mx-auto w-full page-wide px-4 py-14 sm:px-6">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              How ordering works
            </h2>
            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

        {featured && (
          <section className="mx-auto grid w-full page-wide grid-cols-1 items-start gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
            {/* Top-aligned and sticky: the card beside it is much taller than this. */}
            <div className="md:sticky md:top-28 md:pt-2">
              <Eyebrow align="left">Order tracking</Eyebrow>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                See where every order stands
              </h2>
              <ul className="mt-6 space-y-5">
                <Point icon={GLYPH.clock} title="Missing details won’t delay you">
                  If you don&rsquo;t have a measurement or document yet, mark it TBD and submit.
                  Signage.com will follow up with you.
                </Point>
                <Point icon={GLYPH.list} title="A shared checklist">
                  You and Signage.com work from the same checklist for each store, so it is always
                  clear what is still outstanding.
                </Point>
                <Point icon={GLYPH.bell} title="Email updates">
                  You&rsquo;ll get an email when something needs your attention, such as a quote to
                  review or a change requested by {brand.name}.
                </Point>
              </ul>
            </div>
            <ExampleStore brand={brand} signs={signs} />
          </section>
        )}

        <section className="border-t border-gray-200/70 bg-white">
          <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-gray-900">
              Common questions
            </h2>
            <div className="mt-6 divide-y divide-gray-200 rounded-xl border border-gray-200">
              {FAQ(brand.name).map((item) => (
                <details key={item.q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-900">
                    {item.q}
                    <span className="text-lg leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full page-wide px-4 py-14 text-center sm:px-6">
          <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            Already have an account?
          </h2>
          <Link
            href={signIn}
            className="mt-5 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)' }}
          >
            Sign in
          </Link>
          <p className="mx-auto mt-5 max-w-xl text-[11px] leading-relaxed text-gray-500">
            Images are computer-generated previews. Prices shown in the portal are estimates; your
            final price and timeline depend on your site. Signage.com tracks landlord approval but
            cannot guarantee landlord or permit approval.
          </p>
        </section>
      </main>
    </>
  );
}

function HeaderSignIn({ href }: { href: string }) {
  return (
    <Link href={href} className="text-sm font-semibold text-gray-700 underline-offset-2 hover:underline">
      Sign in
    </Link>
  );
}

/** The brand's own signs as the hero picture: one large, up to three small. */
function HeroSigns({
  brand,
  featured,
  others,
}: {
  brand: BrandPublic;
  featured: ShowcaseSign;
  others: ShowcaseSign[];
}) {
  return (
    <div className="relative">
      <figure className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signImageUrl(featured.image_path)}
          alt={featured.name}
          className="aspect-[4/3] w-full object-cover"
        />
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3">
          <span className="text-sm font-semibold text-gray-900">{signName(featured.name, brand.name)}</span>
          <span className="text-xs text-gray-500">{featured.sign_type}</span>
        </figcaption>
      </figure>
      {others.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {others.map((sign) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={sign.id}
              src={signImageUrl(sign.image_path)}
              alt={sign.name}
              title={sign.name}
              className="aspect-square w-full rounded-xl border border-gray-200 bg-white object-cover shadow-sm"
            />
          ))}
        </div>
      )}
      <p
        className="absolute -top-3 left-4 rounded-full border bg-white px-3 py-1 text-[11px] font-semibold shadow-sm"
        style={{ color: 'var(--color-brand-dark)', borderColor: 'var(--color-brand-light)' }}
      >
        {brand.name} approved design
      </p>
    </div>
  );
}

/**
 * A made-up store mid-setup, drawn the way a franchisee's store card and
 * readiness checklist look once signed in (and labelled as an example). The
 * signs are the brand's real ones; the store, its status and its numbers are
 * not. Landing page only: the shared ReadinessCard stays as the request page
 * and the team console use it.
 */
function ExampleStore({ brand, signs }: { brand: BrandPublic; signs: ShowcaseSign[] }) {
  const current = 1; // SETUP_STAGES: "Approvals"
  const rows = EXAMPLE_READINESS.rows;
  const done = rows.filter((row) => row.state === 'done').length;
  const shown = signs.slice(0, 3);
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'var(--color-brand)' }}
            aria-hidden
          >
            {GLYPH.store}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">Example Plaza</p>
            <p className="mt-0.5 text-xs text-gray-500">{brand.name} · Inline store · opens in 6 weeks</p>
          </div>
          <span className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Example
          </span>
        </div>

        <div className="px-5 pt-5">
          <ol className="relative grid grid-cols-6" aria-label="Setup stages">
            {/* The rail behind the dots: filled up to the stage under way. */}
            <span className="absolute left-[8.33%] right-[8.33%] top-[9px] h-0.5 bg-gray-200" aria-hidden />
            <span
              className="absolute left-[8.33%] top-[9px] h-0.5"
              style={{ width: `${(current / (SETUP_STAGES.length - 1)) * 83.33}%`, background: 'var(--color-brand)' }}
              aria-hidden
            />
            {SETUP_STAGES.map((stage, index) => (
              <li key={stage} className="relative flex min-w-0 flex-col items-center text-center">
                {index < current ? (
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                    style={{ background: 'var(--color-brand)' }}
                  >
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 10.5l3 3 7-7" />
                    </svg>
                  </span>
                ) : index === current ? (
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white"
                    style={{ borderColor: 'var(--color-brand)' }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-brand)' }} />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-gray-200 bg-white" />
                )}
                <span
                  // A phone has room for one label: the stage under way.
                  className={`mt-1.5 w-full truncate text-[10px] ${
                    index === current
                      ? 'font-semibold text-gray-900'
                      : `hidden sm:block ${index < current ? 'text-gray-700' : 'text-gray-400'}`
                  }`}
                >
                  {stage}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
            <span className="mt-0.5 shrink-0 text-sky-700 [&>svg]:h-4 [&>svg]:w-4" aria-hidden>
              {GLYPH.clock}
            </span>
            {brand.name} is reviewing your add-on. Your standard signs are already approved.
          </p>
        </div>

        {shown.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 px-5 pt-4">
            {shown.map((sign) => {
              const status = sign.in_package
                ? { text: 'Approved', className: 'bg-emerald-50 text-emerald-800' }
                : { text: 'In review', className: 'bg-sky-50 text-sky-800' };
              return (
                <li key={sign.id} className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signImageUrl(sign.image_path)}
                    alt={sign.name}
                    className="aspect-square w-full rounded-lg border border-gray-100 object-cover"
                  />
                  <p className="mt-1 truncate text-[11px] font-medium text-gray-800">
                    {signName(sign.name, brand.name)}
                  </p>
                  <span className={`mt-0.5 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}>
                    {status.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">Package readiness</p>
            <p className="text-xs text-gray-500">
              {done} of {rows.length} ready
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(done / rows.length) * 100}%`, background: 'var(--color-brand)' }}
            />
          </div>
          <ul className="mt-3 space-y-1">
            {rows.map((row) => {
              const tone = ROW_TONE[row.state];
              return (
                <li key={row.key} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.tile}`} aria-hidden>
                    {ROW_GLYPH[row.key]}
                    <span
                      className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white ring-2 ring-white ${tone.badge}`}
                    >
                      {tone.mark}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-gray-800">{row.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-right text-[11px] font-medium ${tone.pill}`}>
                    {row.value}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Open items don&rsquo;t hold up the order. Signage.com follows up on them before
            preparing the quote.
          </p>
        </div>
      </div>
      <figcaption className="mt-2 px-1 text-[11px] text-gray-500">
        Example store for illustration. The signs shown are {brand.name}&rsquo;s approved designs.
      </figcaption>
    </figure>
  );
}

function Eyebrow({ children, align = 'center' }: { children: React.ReactNode; align?: 'center' | 'left' }) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-widest ${align === 'center' ? 'text-center' : ''}`}
      style={{ color: 'var(--color-brand)' }}
    >
      {children}
    </p>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand-dark)' }}
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{children}</p>
      </div>
    </li>
  );
}

const STROKE = {
  className: 'h-5 w-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Line icons on a 24px grid, drawn in the current colour. */
const GLYPH = {
  clock: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M9 6.5h10M9 12h10M9 17.5h10" />
      <path d="M4.5 6.5l1 1 2-2M4.5 12l1 1 2-2" />
      <circle cx="5.5" cy="17.5" r="1" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2 2 0 004 0" />
    </svg>
  ),
  store: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 9.5l1.5-5h13L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0" />
      <path d="M5.5 12v7.5h13V12M10 19.5v-4h4v4" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 8.5h3.5L9 6h6l1.5 2.5H20v10H4z" />
      <circle cx="12" cy="13.3" r="3.2" />
    </svg>
  ),
  ruler: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M3.5 15.5L15.5 3.5l5 5-12 12z" />
      <path d="M7 12l2 2M10 9l1.5 1.5M13 6l2 2" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5-4-1.8-7-5.2-7-9.5V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" {...STROKE}>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </svg>
  ),
};

/** Each readiness row's own icon, so the checklist reads at a glance. */
const ROW_GLYPH: Record<string, React.ReactNode> = {
  location: GLYPH.pin,
  photos: GLYPH.camera,
  sizing: GLYPH.ruler,
  approvals: GLYPH.badge,
  landlord: GLYPH.document,
};

const ROW_TONE: Record<ReadinessState, { tile: string; pill: string; badge: string; mark: string }> = {
  done: { tile: 'bg-emerald-50 text-emerald-700', pill: 'bg-emerald-50 text-emerald-800', badge: 'bg-emerald-600', mark: '✓' },
  follow_up: { tile: 'bg-amber-50 text-amber-700', pill: 'bg-amber-50 text-amber-800', badge: 'bg-amber-500', mark: '!' },
  with_corporate: { tile: 'bg-sky-50 text-sky-700', pill: 'bg-sky-50 text-sky-800', badge: 'bg-sky-600', mark: '…' },
};

/** "Freshbites Storefront Letters" reads as "Storefront Letters" on the brand's own page. */
function signName(name: string, brandName: string): string {
  const trimmed = name.startsWith(`${brandName} `) ? name.slice(brandName.length + 1) : name;
  return trimmed || name;
}

const ICON = {
  className: 'h-5 w-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function WHAT_YOU_GET(brandName: string) {
  return [
    {
      title: 'Approved designs',
      body: `Each sign is designed with the ${brandName} logo and approved by the brand. You can adjust the size to suit your storefront; the rest of the design stays as specified.`,
      icon: (
        <svg viewBox="0 0 24 24" {...ICON}>
          <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
        </svg>
      ),
    },
    {
      title: 'Prices up front',
      body: 'You see Signage.com’s estimate for each sign as you choose it. Budget, quote and invoice documents are available to download for your lender.',
      icon: (
        <svg viewBox="0 0 24 24" {...ICON}>
          <path d="M4 7h16v10H4z" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7 10v4M17 10v4" />
        </svg>
      ),
    },
    {
      title: 'A record of every store',
      body: 'Installed signs are saved to your store’s record. If one is damaged, you can reorder the same sign without going through approval again.',
      icon: (
        <svg viewBox="0 0 24 24" {...ICON}>
          <path d="M4 10l8-6 8 6v9a1 1 0 01-1 1H5a1 1 0 01-1-1z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ),
    },
  ];
}

// What the steps say is what the product does today, in the order a new
// franchisee meets it (SPEC §8d level 1, then level 2, then §6's tail).
function HOW_IT_WORKS(brandName: string) {
  return [
    {
      title: 'Accept your invitation',
      body: `${brandName} sends you an invitation when you sign your franchise agreement. Use it to set your password.`,
      output: 'Your account',
    },
    {
      title: 'Plan your budget',
      body: 'See the signage cost for each store format to include in your business plan and loan application.',
      output: 'Signage budget',
    },
    {
      title: 'Add your store',
      body: 'Enter the address, opening date and the sign requirements from your lease. Anything you don’t know yet can be marked TBD.',
      output: 'Store record',
    },
    {
      title: 'Choose your signs',
      body: `Your standard package is preselected. Adjust sizes, add site photos and request any extra signs, which ${brandName} reviews.`,
      output: 'Approved sign list',
    },
    {
      title: 'Order and install',
      body: 'Accept the Signage.com quote, then track production, shipping and installation.',
      output: 'Installed signs',
    },
  ];
}

// What a new franchisee asks first. Each answer is what the product does
// today; none promises an approval, a permit or a price.
function FAQ(brandName: string) {
  return [
    {
      q: 'How do I get an account?',
      a: `${brandName} registers your email address when you sign your franchise agreement, and you’ll receive an invitation to set a password. Accounts can’t be created on this site directly. Once you’re set up, you can invite your store managers.`,
    },
    {
      q: 'Can I change a sign’s design?',
      a: `You can adjust the size of most signs to suit your storefront and preview the result before ordering. The logo can’t be changed. If you need something outside ${brandName}’s approved range, you can still request it, and ${brandName} will review it first.`,
    },
    {
      q: 'Can I use this for an SBA or equipment loan?',
      a: 'Yes. You can download a signage budget for your business plan, and a budgetary quote, invoice and payment receipt as your order progresses. Signage.com does not arrange financing.',
    },
    {
      q: 'Who handles landlord approval and permits?',
      a: 'Upload the sign criteria from your lease and Signage.com will check your order against it and keep track of your landlord’s approval. Landlord and permit approvals can’t be guaranteed.',
    },
    {
      q: 'What if a sign is damaged later?',
      a: 'Every installed sign is saved to your store’s record. You can reorder an identical replacement from there, and it doesn’t need to be approved again.',
    },
  ];
}

const EXAMPLE_READINESS: Readiness = {
  reviewReady: false,
  followUps: 1,
  rows: [
    { key: 'location', label: 'Location details', state: 'done', value: 'Received' },
    { key: 'photos', label: 'Site photos', state: 'follow_up', value: '2 of 3 signs' },
    { key: 'sizing', label: 'Sizes and site details', state: 'done', value: 'All confirmed' },
    { key: 'approvals', label: 'Approved signs', state: 'with_corporate', value: '2 approved · 1 in review' },
    { key: 'landlord', label: 'Landlord sign criteria', state: 'done', value: 'Reviewed' },
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
                  <span className="text-gray-500"> · {budget.packageLabel}</span>
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
  canEdit,
}: {
  brandSlug: string;
  location: LocationRow;
  canOrder: boolean;
  /** The owner and Signage.com may change the store's details (DECISIONS #177). */
  canEdit: boolean;
}) {
  const address = [location.address.line1, location.address.city, location.address.state]
    .filter(Boolean)
    .join(', ');
  // Every store shows where its signage stands: its setup request's stage
  // while one is open, all done once installed, else the first stage.
  const setupRequest = location.open_requests.find((request) => request.intent === 'initial_setup');
  const progress = storeProgress(setupRequest?.status ?? null, location.installed_signs.length);
  const opening = openingLine(location.opening_date);
  // No order yet: the first one loads the store type's standard package, so
  // "Choose your signs" is the only way in until then (not "Request signage",
  // where every sign would be an add-on).
  const started =
    location.installed_signs.length > 0 || (!!setupRequest && setupRequest.status !== 'declined');
  const trackerHref =
    setupRequest && setupRequest.status !== 'declined'
      ? `/${brandSlug}/request/${setupRequest.access_token}`
      : !started && canOrder
        ? `/${brandSlug}/location/${location.id}/setup`
        : null;

  const requestSignage = canOrder && started && (
    <Link
      href={`/${brandSlug}/location/${location.id}/request`}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:border-gray-400"
    >
      + Request signage
    </Link>
  );

  return (
    // The setup-tracker handle covers the whole card: its stages, its opening
    // date and what is happening now are read together (smoke).
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="setup-tracker">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{location.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-gray-500">
            <PinIcon /> {address}
            {canEdit && (
              <>
                <span aria-hidden> · </span>
                <Link
                  href={`/${brandSlug}/location/${location.id}/edit`}
                  className="font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
                >
                  Edit store
                </Link>
              </>
            )}
          </p>
          {opening && <p className="mt-1 text-xs font-medium text-gray-600">{opening}</p>}
        </div>
        <StageTrack progress={progress} />
      </div>

      <div
        className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ${
          progress.complete ? 'bg-gray-50' : progress.action ? 'bg-amber-50' : 'bg-sky-50'
        }`}
      >
        <p
          className={`text-sm ${
            progress.complete ? 'text-gray-700' : progress.action ? 'text-amber-900' : 'text-sky-900'
          }`}
        >
          {progress.now}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {trackerHref && progress.action ? (
            <Link
              href={trackerHref}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-brand)' }}
            >
              {progress.action}
            </Link>
          ) : trackerHref ? (
            <Link href={trackerHref} className="px-1 text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
              View details
            </Link>
          ) : null}
          {requestSignage}
        </div>
      </div>

      {location.installed_signs.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
      ) : null}

      {location.open_requests.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
          {/* Each request shows the signs it asks for, and opens to the full
              list; the code stays a link to the request itself. */}
          {location.open_requests.map((request) => {
            const href = `/${brandSlug}/request/${request.access_token}`;
            return (
              <details key={request.id} className="group rounded-lg" data-request-row={request.code}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm">
                    <Link
                      href={href}
                      className="font-medium underline-offset-2 hover:underline"
                      style={{ color: 'var(--color-brand-dark)' }}
                    >
                      {request.code}
                    </Link>
                    <span className="text-gray-600">
                      {' '}
                      · {INTENT_LABEL[request.intent] ?? request.intent} · {request.item_count}{' '}
                      {request.item_count === 1 ? 'sign' : 'signs'}
                    </span>
                  </span>
                  <SignStrip signs={request.signs} />
                  <span className="ml-auto flex items-center gap-2">
                    <RequestStatusChip status={request.status} />
                    <ExpandChevron />
                  </span>
                </summary>
                <div className="px-1 pb-2 pt-1">
                  <RequestSignList signs={request.signs} />
                  <Link
                    href={href}
                    className="mt-2 inline-block text-xs font-medium underline-offset-2 hover:underline"
                    style={{ color: 'var(--color-brand-dark)' }}
                  >
                    Open {request.code} →
                  </Link>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The six stages of a store's signage as a compact track: done stages
 * checked, the one under way ringed. A phone shows only that stage's label.
 */
function StageTrack({ progress }: { progress: SetupProgress & { complete: boolean } }) {
  const last = SETUP_STAGES.length - 1;
  const filled = Math.min(progress.current, last) / last;
  return (
    <div>
    <ol className="relative grid grid-cols-6" aria-label="Setup stages">
      <span className="absolute left-[8.33%] right-[8.33%] top-[9px] h-0.5 bg-gray-200" aria-hidden />
      <span
        className="absolute left-[8.33%] top-[9px] h-0.5"
        style={{ width: `${filled * 83.33}%`, background: 'var(--color-brand)' }}
        aria-hidden
      />
      {SETUP_STAGES.map((stage, index) => {
        const done = index < progress.current;
        const current = index === progress.current;
        return (
          <li
            key={stage}
            aria-current={current ? 'step' : undefined}
            className="relative flex min-w-0 flex-col items-center text-center"
          >
            {done ? (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-white"
                style={{ background: 'var(--color-brand)' }}
              >
                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 10.5l3 3 7-7" />
                </svg>
              </span>
            ) : current ? (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white"
                style={{ borderColor: 'var(--color-brand)' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-brand)' }} />
              </span>
            ) : (
              <span className="h-5 w-5 rounded-full border-2 border-gray-200 bg-white" />
            )}
            <span
              className={`mt-1.5 hidden w-full truncate text-[11px] sm:block ${
                current ? 'font-semibold text-gray-900' : done ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              {done && <span className="sr-only">Done: </span>}
              {current && <span className="sr-only">Now: </span>}
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
    {/* Six labels do not fit a phone: there, one line names the stage. */}
    <p className="mt-2 text-xs text-gray-600 sm:hidden" aria-hidden="true">
      {progress.complete ? (
        <span className="font-semibold text-gray-900">All {SETUP_STAGES.length} stages complete</span>
      ) : (
        <>
          Step {progress.current + 1} of {SETUP_STAGES.length} ·{' '}
          <span className="font-semibold text-gray-900">{SETUP_STAGES[progress.current]}</span>
        </>
      )}
    </p>
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
