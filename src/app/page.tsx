// The root — the landing page, and the choice of where to sign in.
//
// Signage.com and each brand have their own way in (SPEC v2.3 §10.4): the team
// signs in to Signage.com here, and a brand's franchisees and corporate sign in
// on that brand's portal — `{brand}.signage.com`, `freshbites.localhost` in
// development — with its own header, colours and session. So, signed out, this
// page asks which. Signed in, it goes straight to the account's home, so `/` is
// always the right address to hand someone.
//
// Nobody signs up: accounts come from invitations (SPEC v2.3 §10), and the page
// says so rather than offering a button that cannot exist. Nothing here is a
// credential; the operator's index of live links is /admin/entry-points, and
// the walkthrough is /admin/demo — both behind sign-in, for that reason.

import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { FormNotice } from '@/components/AuthCard';
import { getViewer, homeFor, owesSecondFactor } from '@/lib/auth/access';
import { getBrandsPublic, type BrandPublic } from '@/lib/db/queries';
import { portalConfig, portalOrigin } from '@/lib/portal';

import { SignOutButton } from './sign-in/SignOutButton';

export const dynamic = 'force-dynamic';

/**
 * Where a brand's people sign in: its own portal when this deployment serves
 * portals, else the path-based sign-in, which still wears the brand (it reads
 * the brand from `next`).
 */
function brandSignIn(brand: BrandPublic, host: string | null): string {
  const origin = portalOrigin(brand.slug, host, portalConfig());
  if (origin) return `${origin}/sign-in`;
  return `/sign-in?next=${encodeURIComponent(`/${brand.slug}`)}`;
}

const WHO = [
  {
    who: 'Franchisees',
    what: 'Order from your brand’s standard package, follow every request to install, and download the budget and quote documents your lender asks for.',
  },
  {
    who: 'Brand corporate',
    what: 'See every location’s signage in one place, and approve add-ons and exceptions line by line — from the dashboard, or straight from the email.',
  },
  {
    who: 'Signage.com',
    what: 'Prepare, price, route and fulfil each package, and record every installed sign against its location.',
  },
];

export default async function Home() {
  const viewer = await getViewer();
  let signedInWithoutAccess = false;
  if (viewer) {
    const home = homeFor(viewer.memberships);
    if (owesSecondFactor(viewer)) redirect(`/two-factor?next=${encodeURIComponent(home)}`);
    // An account whose every role was deactivated has no home; `/` is where
    // homeFor sends it, so redirecting would loop. Say so instead.
    if (home !== '/') redirect(home);
    signedInWithoutAccess = true;
  }

  const host = (await headers()).get('host');
  const brands = signedInWithoutAccess ? [] : await getBrandsPublic();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-gray-50">
      <Backdrop />

      <header className="relative border-b border-gray-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Franchise <span className="font-normal text-gray-500">by</span> Signage
          </span>
          <span className="text-xs text-gray-500">Operated by Signage.com</span>
        </div>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.15fr_1fr] md:gap-16 md:py-20">
        <section>
          <p className="text-xs font-medium uppercase tracking-widest text-brand">
            Signage for franchise brands
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            Every location&rsquo;s signage, from agreement to install.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600">
            One portal for a brand&rsquo;s whole signage program. Franchisees order against
            brand-approved packages, corporate approves what needs approving, and Signage.com
            delivers it.
          </p>

          <ul className="mt-8 space-y-4">
            {WHO.map((row) => (
              <li key={row.who} className="flex gap-3">
                <span
                  className="mt-1.5 h-2 w-2 flex-none rounded-full"
                  style={{ background: 'var(--color-brand)' }}
                  aria-hidden="true"
                />
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">{row.who}.</span> {row.what}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="order-first w-full max-w-md justify-self-center rounded-2xl border border-gray-200 bg-white/95 p-6 shadow-xl shadow-gray-300/40 backdrop-blur sm:p-8 md:order-none md:justify-self-end">
          {signedInWithoutAccess && viewer ? (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">No access right now</h2>
              <FormNotice>
                You&rsquo;re signed in as {viewer.profile.email}, but this account has no active
                role. If that&rsquo;s unexpected, ask whoever invited you.
              </FormNotice>
              <SignOutButton />
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-900">Where do you sign in?</h2>
              <p className="mt-1 text-sm text-gray-500">
                Signage.com and each brand have their own sign-in.
              </p>
              <nav aria-label="Choose where to sign in" className="mt-6 space-y-3">
                <Link
                  href="/sign-in"
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400"
                >
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
                    S
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">Signage.com</span>
                    <span className="block text-xs text-gray-500">
                      The team: queue, pricing, routing and fulfilment
                    </span>
                  </span>
                  <span className="text-gray-400 group-hover:text-gray-900" aria-hidden="true">
                    &rarr;
                  </span>
                </Link>
                {brands.map((brand) => (
                  <a
                    key={brand.id}
                    href={brandSignIn(brand, host)}
                    className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400"
                  >
                    <span
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ background: brand.brand_colors?.primary ?? 'var(--color-brand)' }}
                    >
                      {brand.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">{brand.name}</span>
                      <span className="block text-xs text-gray-500">
                        Franchisees, store staff and {brand.name} corporate
                      </span>
                    </span>
                    <span className="text-gray-400 group-hover:text-gray-900" aria-hidden="true">
                      &rarr;
                    </span>
                  </a>
                ))}
              </nav>
              <div className="mt-6 space-y-2 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
                <p>
                  Accounts are created by invitation. If you were invited, open that email to
                  set your password first.
                </p>
                <p>
                  Reviewing signage for your brand? The buttons in the approval email work without
                  signing in.
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="relative border-t border-gray-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-gray-500 sm:px-6">
          <span>Franchise by Signage · Signage.com</span>
          <Link href="/admin/demo" className="hover:text-gray-900 hover:underline">
            Product walkthrough (Signage.com team)
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * Behind everything: soft washes of the brand colour, a dot grid that fades
 * out, and a few faint outlines of signs — a fascia, a blade sign, a pylon —
 * kept to the edges so the text and the form stay the only things to read.
 */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div
        className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 14%, transparent), transparent)' }}
      />
      <div
        className="absolute -bottom-48 -right-32 h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent)' }}
      />
      <div
        className="absolute right-1/3 top-1/4 h-72 w-72 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #E0F2FE, transparent)' }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      <svg
        className="absolute bottom-[4%] left-[2%] hidden h-36 w-36 md:block"
        viewBox="0 0 160 160"
        fill="none"
        style={{ color: 'var(--color-brand)' }}
      >
        {/* A pylon sign. */}
        <rect x="46" y="14" width="68" height="84" rx="10" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
        <rect x="56" y="26" width="48" height="12" rx="3" fill="currentColor" fillOpacity="0.08" />
        <rect x="56" y="46" width="48" height="8" rx="3" fill="currentColor" fillOpacity="0.06" />
        <rect x="56" y="62" width="48" height="8" rx="3" fill="currentColor" fillOpacity="0.06" />
        <path d="M74 98v48M86 98v48" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" />
      </svg>

      <svg
        className="absolute right-[4%] top-[8%] hidden h-24 w-72 lg:block"
        viewBox="0 0 288 96"
        fill="none"
        style={{ color: 'var(--color-brand)' }}
      >
        {/* A fascia sign on its raceway. */}
        <rect x="4" y="18" width="280" height="60" rx="14" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" />
        <rect x="28" y="38" width="20" height="20" rx="6" fill="currentColor" fillOpacity="0.08" />
        <rect x="60" y="40" width="190" height="16" rx="4" fill="currentColor" fillOpacity="0.06" />
      </svg>

      <svg
        className="absolute bottom-[10%] right-[38%] hidden h-24 w-24 lg:block"
        viewBox="0 0 96 96"
        fill="none"
        style={{ color: 'var(--color-brand)' }}
      >
        {/* A blade sign on its bracket. */}
        <path d="M8 20h30" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" strokeLinecap="round" />
        <rect x="38" y="10" width="34" height="72" rx="8" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" />
        <circle cx="55" cy="32" r="7" fill="currentColor" fillOpacity="0.08" />
        <rect x="47" y="48" width="16" height="4" rx="2" fill="currentColor" fillOpacity="0.07" />
        <rect x="47" y="57" width="16" height="4" rx="2" fill="currentColor" fillOpacity="0.07" />
      </svg>
    </div>
  );
}
