// Signage.com's margins (SPEC v2.6 §8, DECISIONS #165).
//
// The Design Studio engine returns Signize's cost; the price a franchisee sees
// is cost / (1 - margin). The team sets a standard margin, a default per brand,
// and a margin per brand and sign type. No brand role ever sees this page or
// its numbers.

import { requireTeamMember } from '@/lib/auth/team';
import { priceFromCost } from '@/lib/pricing/margin';
import { marginOverview } from '@/lib/pricing/margins';

import { MarginInput } from './MarginInput';
import { QuoteConfirmationToggle } from './QuoteConfirmationToggle';

export const metadata = { title: 'Pricing · Signage.com' };

const EXAMPLE_COST = 1000;

function example(percent: number) {
  const price = priceFromCost(EXAMPLE_COST, percent);
  return price === null ? '' : `$${EXAMPLE_COST.toLocaleString('en-US')} cost → $${price.toLocaleString('en-US')}`;
}

export default async function PricingPage() {
  await requireTeamMember();
  const { platformPercent, brands } = await marginOverview();

  return (
    <main className="mx-auto w-full page flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">Pricing</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        The Design Studio returns Signize&rsquo;s cost for a sign. The price franchisees see adds
        Signage.com&rsquo;s margin: <strong>price = cost ÷ (1 − margin)</strong>, so a 40% margin on a
        $600 cost is a $1,000 price. The most specific margin set applies — the brand and sign type,
        then the brand, then the standard. Brands never see these numbers. Custom-quote sign types
        are priced by hand and are not listed. Each brand also says whether the team confirms its
        quotes before the franchisee sees them.
      </p>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Standard margin</h2>
          <p className="text-xs text-gray-500">
            Every brand and sign type without its own. {example(platformPercent)}
          </p>
        </div>
        <MarginInput brandId={null} signType={null} percent={platformPercent} inherited={null} label="Standard margin" />
      </section>

      {brands.map((brand) => {
        const brandApplies = brand.brandPercent ?? platformPercent;
        const used = brand.signTypes.filter((type) => type.inUse > 0 || type.percent !== null);
        const rest = brand.signTypes.filter((type) => type.inUse === 0 && type.percent === null);
        return (
          <section key={brand.id} className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{brand.name}</h2>
                <p className="text-xs text-gray-500">
                  {brand.brandPercent === null
                    ? `Uses the standard ${platformPercent}%. Set a number to give ${brand.name} its own.`
                    : `${brand.name}'s own default. Empty it to use the standard ${platformPercent}%.`}
                </p>
              </div>
              <MarginInput
                brandId={brand.id}
                signType={null}
                percent={brand.brandPercent}
                inherited={platformPercent}
                label={`${brand.name} margin`}
              />
            </div>

            <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
              {used.map((type) => (
                <MarginRow key={type.signType} brandId={brand.id} type={type} inherited={brandApplies} />
              ))}
              {used.length === 0 && (
                <li className="py-2 text-xs text-gray-500">{brand.name} has no engine-priced signs yet.</li>
              )}
            </ul>
            {rest.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer py-2 text-xs font-medium text-gray-600">
                  {rest.length} more sign types {brand.name} does not use yet
                </summary>
                <ul className="divide-y divide-gray-100">
                  {rest.map((type) => (
                    <MarginRow key={type.signType} brandId={brand.id} type={type} inherited={brandApplies} />
                  ))}
                </ul>
              </details>
            )}
            <QuoteConfirmationToggle
              brandId={brand.id}
              brandName={brand.name}
              teamConfirms={brand.teamConfirmsQuotes}
            />
          </section>
        );
      })}
    </main>
  );
}

function MarginRow({
  brandId,
  type,
  inherited,
}: {
  brandId: string;
  type: { signType: string; percent: number | null; inUse: number };
  inherited: number;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-gray-900">{type.signType}</p>
        <p className="text-xs text-gray-500">
          {type.inUse > 0 ? `${type.inUse} active sign${type.inUse === 1 ? '' : 's'}` : 'Not in use'}
          {' · '}
          {type.percent === null ? `uses ${inherited}%` : example(type.percent)}
        </p>
      </div>
      <MarginInput
        brandId={brandId}
        signType={type.signType}
        percent={type.percent}
        inherited={inherited}
        label={`${type.signType} margin`}
      />
    </li>
  );
}
