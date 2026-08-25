// The corporate dashboard (SPEC §9 interface 6).
//
// A franchisor's whole signage program on one page: how many locations, how
// much is installed, what is in flight, what it has cost, and which items are
// waiting on them. Read-only by construction — the link that opens it cannot
// approve anything, and the approvals tab says so where someone would look for
// the buttons (DECISIONS #75).
//
// The two panels at the bottom are §8d level 1 and the §8b budget one-pager.
// Both have lived on /admin since they were built, because SPEC names corporate
// as their actor and corporate had nowhere to stand. This is that place. They
// stay on /admin as well, for the reason in DECISIONS #76: Signage.com operates
// this portal white-glove, and every one of these is something a franchisor
// phones about.

import Link from 'next/link';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { RequestStatusChip } from '@/components/StatusChip';
import { corporateSession } from '@/lib/corporate/session';
import { FORMAT_LABEL } from '@/lib/budget';
import {
  getBrandsWithPackages,
  getPendingApprovalRequestIds,
  getPortfolio,
  getRegistrationsForBrand,
  getRequestById,
  type BrandPublic,
  type PortfolioLocation,
  type PortfolioMetrics,
} from '@/lib/db/queries';
import type { LocationFormat } from '@/lib/status/types';

import { Approvals } from './Approvals';
import { LinkTrouble } from './LinkTrouble';
import { Registrations } from './Registrations';

export default async function CorporateDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string; token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { brand: slug, token } = await params;
  const { tab } = await searchParams;

  const resolved = await corporateSession(slug, token);
  if (!resolved.ok) return <LinkTrouble brandSlug={slug} failure={resolved.failure} />;

  const { brand } = resolved.session;
  const [portfolio, pendingIds, registrations, brands] = await Promise.all([
    getPortfolio(brand.id),
    getPendingApprovalRequestIds(brand.id),
    getRegistrationsForBrand(brand.id),
    getBrandsWithPackages(),
  ]);

  const onApprovals = tab === 'approvals';
  const formats = brands.find((entry) => entry.id === brand.id)?.formats ?? [];
  const base = `/${brand.slug}/corporate/${token}`;

  // Rendered through the same detail the reviewer's own page is built from, so
  // corporate reads exactly what their reviewer is looking at.
  const pending = onApprovals
    ? (await Promise.all(pendingIds.map((id) => getRequestById(id)))).filter(
        (request): request is NonNullable<typeof request> => request !== null,
      )
    : [];

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{brand.name} signage program</h1>
            <p className="text-sm text-gray-500">
              Brand control across all locations — operated by Signage.com
            </p>
          </div>

          <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <Tab href={base} label="Dashboard" active={!onApprovals} />
            <Tab
              href={`${base}?tab=approvals`}
              label={
                portfolio.metrics.pendingApprovals
                  ? `Approvals (${portfolio.metrics.pendingApprovals})`
                  : 'Approvals'
              }
              active={onApprovals}
            />
          </nav>
        </div>

        {onApprovals ? (
          <Approvals brand={brand} requests={pending} brandSlug={brand.slug} token={token} />
        ) : (
          <>
            <Metrics metrics={portfolio.metrics} />
            <VendorPolicyCard brand={brand} />

            {portfolio.metrics.pendingApprovals > 0 && (
              <Link
                href={`${base}?tab=approvals`}
                className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
              >
                <span className="text-sm text-amber-900">
                  {portfolio.metrics.pendingApprovals} item
                  {portfolio.metrics.pendingApprovals === 1 ? '' : 's'} awaiting your approval
                </span>
                <span className="text-amber-700" aria-hidden="true">
                  →
                </span>
              </Link>
            )}

            <h2 className="mt-6 text-sm font-semibold text-gray-900">Locations</h2>
            {portfolio.locations.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                No {brand.name} locations are set up yet. They appear here as franchisees complete
                their first signage request.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {portfolio.locations.map((location) => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            )}

            <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-400">
              Standard packages and like-for-like replacements auto-approve under your brand rules —
              only add-ons and flagged exceptions reach your approval queue.
            </p>

            <Registrations
              brandSlug={brand.slug}
              brandName={brand.name}
              token={token}
              registrations={registrations}
            />

            <BudgetDocuments brand={brand} formats={formats} token={token} />
          </>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          {`Opened by ${resolved.session.email}. This link is read-only and expires ${new Date(
            resolved.session.expiresAt,
          ).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`}
        </p>
      </main>
    </>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * The five figures from the demo, with one line of honesty underneath.
 *
 * "Program spend" on its own invites the wrong reading — a franchisor sees a
 * number and takes it for the bill. It is money the program has COMMITTED:
 * packages someone has accepted. What is quoted but not yet accepted is real
 * and is not that, so it is named separately rather than folded in.
 */
function Metrics({ metrics }: { metrics: PortfolioMetrics }) {
  const tiles: Array<[string, string | number, boolean?]> = [
    ['Locations', metrics.locations],
    ['Installed signs', metrics.installedSigns],
    ['Open requests', metrics.openRequests],
    ['Awaiting approval', metrics.pendingApprovals, metrics.pendingApprovals > 0],
    ['Program spend', money(metrics.committedSpend)],
  ];

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map(([label, value, alert]) => (
          <div
            key={label}
            className={`rounded-xl border bg-white p-3 text-center ${
              alert ? 'border-amber-300' : 'border-gray-200'
            }`}
          >
            <p
              className="text-lg font-semibold tabular-nums"
              style={{ color: alert ? '#B45309' : 'var(--color-brand-dark)' }}
            >
              {value}
            </p>
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
        Program spend is what has been accepted — quote packages a franchisee or the Signage.com
        team has signed off.
        {metrics.quotedNotAccepted > 0 && (
          <> A further {money(metrics.quotedNotAccepted)} is quoted and not yet accepted.</>
        )}
        {metrics.customQuoteLines > 0 && (
          <>
            {' '}
            {metrics.customQuoteLines} accepted item
            {metrics.customQuoteLines === 1 ? ' is' : 's are'} quoted per site and not in the total.
          </>
        )}
      </p>
    </>
  );
}

const POLICY_LABEL: Record<string, string> = {
  signage_com: 'Signage.com fulfils',
  approved_vendor: 'Approved vendor',
  corporate_first: 'Corporate routes',
};

/**
 * The brand's routing rule, stated back to them.
 *
 * Corporate set this at white-glove onboarding and then never sees it again,
 * which is how a franchisor ends up surprised that packages went to a vendor
 * they replaced last year. It is read-only here for the same reason it was set
 * that way: changing it re-routes live money, and that is a conversation.
 */
function VendorPolicyCard({ brand }: { brand: BrandPublic }) {
  const external = brand.vendor_policy !== 'signage_com';
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs leading-relaxed text-gray-600">
        <span className="font-medium text-gray-800">
          Vendor policy: {POLICY_LABEL[brand.vendor_policy] ?? brand.vendor_policy}
        </span>
        {` — quote packages route to ${brand.vendor_name ?? 'Signage.com'} by default; per-sign overrides apply${
          brand.corporate_cc ? '. Corporate is copied on every package.' : '.'
        }`}
      </p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">
        {external
          ? 'Your vendor quotes and fulfils directly; the portal keeps your approval control and the location records.'
          : 'Signage.com quotes and fulfils; production is tracked in the portal.'}{' '}
        Set during white-glove setup — contact your Signage.com manager to change it.
      </p>
    </div>
  );
}

/**
 * One card per location, and the only judgment on the page.
 *
 * "Package complete" compares installed signs against the length of the brand's
 * standard package for that format — duplicates included, because an endcap's
 * two elevations are two sets of letters. It is a completeness check, not a
 * compliance ruling: the portal never promises an approval or permit outcome
 * (CLAUDE.md), and a location can be fully signed and still waiting on a city.
 */
function LocationCard({ location }: { location: PortfolioLocation }) {
  const complete = location.package_size > 0 && location.installed_count >= location.package_size;
  const opening = location.opening_date ? new Date(location.opening_date) : null;
  const daysOut = location.days_to_opening;
  // Urgency, not decoration: a location opening inside a month with signs still
  // missing is the one thing on this page worth a phone call today.
  const urgent = !complete && daysOut !== null && daysOut <= 30;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{location.name}</p>
          <p className="truncate text-xs text-gray-500">
            {[location.address.line1, location.address.city, location.address.state]
              .filter(Boolean)
              .join(', ') || 'Address on file with the franchisee'}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            complete ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {complete ? 'Package complete' : 'Setup in progress'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          {location.installed_count} installed
          {location.package_size > 0 && ` of ${location.package_size} standard`}
        </span>
        <span className="text-gray-400">{FORMAT_LABEL[location.format]}</span>
        {opening && (
          <span className={urgent ? 'font-medium text-amber-700' : ''}>
            opens {opening.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {urgent && daysOut !== null && (daysOut >= 0 ? ` · ${daysOut} days` : ' · overdue')}
          </span>
        )}
        {location.oldest_install && (
          <span className="text-gray-400">
            oldest sign {new Date(location.oldest_install).getFullYear()}
          </span>
        )}
        {location.open_requests.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {location.open_requests.map((request) => (
              <RequestStatusChip key={request.id} status={request.status} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The §8b budget one-pager, at last in the hands of the person SPEC §8b names.
 *
 * The download route carries the dashboard token: the sheet is a brand's whole
 * standard-package price list, and DECISIONS #44 kept it off a public URL for
 * that reason. A corporate link is not a public URL.
 */
function BudgetDocuments({
  brand,
  formats,
  token,
}: {
  brand: BrandPublic;
  formats: LocationFormat[];
  token: string;
}) {
  if (formats.length === 0) return null;

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Budget sheets</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        The signage number a candidate hands their lender, per location format, before any site
        exists. Priced from your standard packages at today&apos;s prices — an estimate, not a
        quote.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {formats.map((format) => (
          <a
            key={format}
            href={`/api/documents/budget/${brand.slug}/${format}?token=${token}`}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            {FORMAT_LABEL[format]} budget PDF ↓
          </a>
        ))}
      </div>
    </section>
  );
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
