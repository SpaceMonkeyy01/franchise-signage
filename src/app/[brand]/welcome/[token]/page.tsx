// The level-1 landing page (SPEC §8d).
//
// Where the welcome email's one button goes, and the whole of a franchisee's
// relationship with the product until they have a lease. It holds exactly the
// two things §8d says belong at agreement signing: a signage number for the
// bank, and concept drawings for a candidate site.
//
// Ordering signs is deliberately absent — not hidden behind a disabled control,
// simply not here. At this moment there is no site to sign, and a franchisee
// shown an order flow they cannot use learns that half the product is noise.
//
// The DID (§8c) is Session 8. It appears as a described next stage rather than a
// dead button, for the same reason the email leaves it unlinked: a control that
// does nothing costs more trust than a sentence saying "not yet".

import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { budgetByFormat, budgetMoney } from '@/lib/budget';
import { getRegistrationByToken } from '@/lib/db/queries';

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ brand: string; token: string }>;
}) {
  const { brand: slug, token } = await params;

  const found = await getRegistrationByToken(token);
  // The token is the credential, and it carries its own brand — but a link built
  // for one brand's page must not render under another's chrome.
  if (!found || found.brand.slug !== slug) notFound();

  const { registration, brand } = found;
  const budgets = await budgetByFormat(brand.id);
  const first = registration.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Planning stage
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            {first ? `${first}, your ` : 'Your '}
            <span style={{ color: 'var(--color-brand)' }}>{brand.name}</span> signage
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">
            Two things matter before you have a building: the number your lender asks for, and what
            the storefront will look like. Both live here. Nothing needs an account — this page is
            yours from the link in your email.
          </p>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Your signage budget</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            The standard {brand.name} package at each location format, at today&apos;s prices. Take
            the sheet that matches the site you are negotiating — it is written for a business plan
            or a loan application.
          </p>

          {budgets.length === 0 ? (
            // A brand with no packages has no number to give, and an empty card
            // with a $0 total would be worse than saying so.
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">
              {brand.name}&apos;s standard packages are still being set up. Your {brand.name}{' '}
              contact can give you a signage figure in the meantime.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {budgets.map((budget) => (
                <div
                  key={budget.format}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{budget.formatLabel}</p>
                    <p className="text-xs text-gray-500">{budget.packageLabel}</p>
                  </div>
                  <p
                    className="text-base font-bold tabular-nums"
                    style={{ color: 'var(--color-brand-dark)' }}
                  >
                    {budgetMoney(budget.priced)}
                    {budget.customLines > 0 && (
                      <span className="ml-1 text-xs font-medium text-gray-400">+ custom</span>
                    )}
                  </p>
                  <a
                    href={`/api/documents/welcome/${token}/${budget.format}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--color-brand)' }}
                  >
                    Budget sheet ↓
                  </a>
                </div>
              ))}
            </div>
          )}

          {budgets.some((budget) => budget.customLines > 0) && (
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Items quoted per site — a pylon or monument sign, for instance — are listed on the
              sheet but not in these totals. Nobody can price one before the frontage and the local
              sign code are known, and a total that quietly included a guess is the number a lender
              would hold you to.
            </p>
          )}

          <p className="mt-3 text-xs font-medium text-gray-500">
            An estimate for planning. Not a quote, a bid, or an offer to contract.
          </p>
        </section>

        <section className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">When you have a candidate site</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Once you are at letter of intent on a specific address, {brand.name} and Signage.com
            produce concept drawings of that storefront and a budgetary quote against its real
            frontage — the pair a lender works from during underwriting, and the point at which the
            estimate above becomes a number for your site rather than your format. Tell your{' '}
            {brand.name} contact when you are close.
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Concept drawings are design intent for planning and lending. They are not construction
            or permit documents.
          </p>
        </section>

        <p className="mt-6 text-center text-xs text-gray-400">
          Registered to {registration.email} by {brand.name}. Signage.com operates this portal for{' '}
          {brand.name}.
        </p>
      </main>
    </>
  );
}
