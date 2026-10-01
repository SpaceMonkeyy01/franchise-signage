// The corporate dashboard (SPEC §9 interface 6; behind sign-in since v2.3 §10).
//
// A franchisor's whole signage program on one page: how many locations, how
// much is installed, what is in flight, what it has cost, and which items are
// waiting on them. Phase C moved it behind sign-in and gave it the two powers
// the emailed dashboard link could never be trusted with — deciding items, and
// managing the brand's people (DECISIONS #75, #128).
//
// What shows depends on the role (src/lib/auth/corporate.ts): reviewers read
// and decide; brand admins also register franchisees and manage People;
// Signage.com sees what a brand admin sees, on every brand.
//
// The §8d registration panel and the §8b budget one-pager stay on /admin as
// well, for the reason in DECISIONS #76.

import Link from 'next/link';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { RequestStatusChip } from '@/components/StatusChip';
import { requireCorporate, type CorporateAccess } from '@/lib/auth/corporate';
import { pendingInvitations, ROLE_LABEL } from '@/lib/auth/invitations';
import { query } from '@/lib/db/pool';
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

import { listBrandPackages, listBrandSigns, listMasterCatalog, listStoreTypes } from '@/lib/catalog/manage';
import { SETUP_STAGES, setupProgress } from '@/lib/setup-progress';
import { brandFranchiseePeople } from '@/lib/staff';

import { Approvals } from './Approvals';
import { Franchisees } from './Franchisees';
import { Packages } from './Packages';
import { People, type InvitedRow, type PersonRow } from './People';
import { Registrations } from './Registrations';
import { Signs } from './Signs';

export const dynamic = 'force-dynamic';

type TabKey = 'dashboard' | 'approvals' | 'signs' | 'people';

export default async function CorporateDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { brand: slug } = await params;
  const { tab: requested } = await searchParams;

  const base = `/${slug}/corporate`;
  const access = await requireCorporate(
    slug,
    requested ? `${base}?tab=${encodeURIComponent(requested)}` : base,
  );
  const { brand } = access;

  const tab: TabKey =
    requested === 'approvals'
      ? 'approvals'
      : requested === 'signs'
        ? 'signs'
        : requested === 'people' && access.canManage
        ? 'people'
        : 'dashboard';

  const [portfolio, pendingIds, brands] = await Promise.all([
    getPortfolio(brand.id),
    getPendingApprovalRequestIds(brand.id),
    getBrandsWithPackages(),
  ]);
  const formats = brands.find((entry) => entry.id === brand.id)?.formats ?? [];

  // Rendered through the same detail the approval email's page is built from,
  // so corporate reads exactly what that page shows.
  const pending =
    tab === 'approvals'
      ? (await Promise.all(pendingIds.map((id) => getRequestById(id)))).filter(
          (request): request is NonNullable<typeof request> => request !== null,
        )
      : [];
  const registrations =
    tab === 'dashboard' && access.canManage ? await getRegistrationsForBrand(brand.id) : [];

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        account={<AccountBadge name={access.viewer.profile.name} email={access.viewer.profile.email} />}
      />

      <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{brand.name} signage program</h1>
            <p className="text-sm text-gray-500">
              Brand control across all locations — operated by Signage.com
            </p>
          </div>

          <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <Tab href={base} label="Dashboard" active={tab === 'dashboard'} />
            <Tab
              href={`${base}?tab=approvals`}
              label={
                portfolio.metrics.pendingApprovals
                  ? `Approvals (${portfolio.metrics.pendingApprovals})`
                  : 'Approvals'
              }
              active={tab === 'approvals'}
            />
            <Tab href={`${base}?tab=signs`} label="Signs" active={tab === 'signs'} />
            {access.canManage && (
              <Tab href={`${base}?tab=people`} label="People" active={tab === 'people'} />
            )}
          </nav>
        </div>

        {tab === 'approvals' && <Approvals brandSlug={brand.slug} requests={pending} />}

        {tab === 'signs' && <SignsTab access={access} />}

        {tab === 'people' && <PeopleTab access={access} />}

        {tab === 'dashboard' && (
          <>
            <Metrics metrics={portfolio.metrics} approvalsHref={`${base}?tab=approvals`} />
            <VendorPolicyCard brand={brand} />

            <h2 className="mt-6 text-sm font-semibold text-gray-900">Locations</h2>
            {portfolio.locations.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                No {brand.name} locations are set up yet. They appear here as franchisees complete
                their first signage request.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {portfolio.locations.map((location) => (
                  <LocationCard
                    key={location.id}
                    location={location}
                    approvalsHref={`${base}?tab=approvals`}
                  />
                ))}
              </div>
            )}

            <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
              Standard packages and like-for-like replacements auto-approve under your brand rules —
              only add-ons and flagged exceptions reach your approval queue.
            </p>

            {access.canManage && (
              <Registrations
                brandSlug={brand.slug}
                brandName={brand.name}
                registrations={registrations}
              />
            )}

            <BudgetDocuments brand={brand} formats={formats} />
          </>
        )}

        <p className="mt-8 text-center text-xs text-gray-500">
          Signed in as {access.viewer.profile.email} · {ROLE_LABEL[access.role]}
        </p>
      </main>
    </>
  );
}

/** The brand's signs (SPEC v2.4 §2.3): brand admins propose and retire; reviewers read. */
async function SignsTab({ access }: { access: CorporateAccess }) {
  const [signs, master, packages, storeTypes] = await Promise.all([
    listBrandSigns(access.brand.id),
    listMasterCatalog(),
    listBrandPackages(access.brand.id),
    listStoreTypes(access.brand.id),
  ]);
  return (
    <>
      <Signs
        brandSlug={access.brand.slug}
        brandName={access.brand.name}
        canManage={access.canManage}
        signs={signs}
        master={master.filter((row) => row.active)}
      />
      <Packages
        brandSlug={access.brand.slug}
        canManage={access.canManage}
        storeTypes={storeTypes}
        packages={packages}
        signs={signs.filter((sign) => sign.review_status === 'approved' && sign.active)}
      />
    </>
  );
}

/** The brand's admins and reviewers, then every franchisee company's people. */
async function PeopleTab({ access }: { access: CorporateAccess }) {
  const [members, invitations, franchisees, registrations] = await Promise.all([
    query<{
      membership_id: string;
      profile_id: string;
      email: string;
      name: string | null;
      role: PersonRow['role'];
      active: boolean;
    }>(
      `select m.id as membership_id, p.id as profile_id, p.email, p.name, m.role, m.active
         from memberships m join profiles p on p.id = m.profile_id
        where m.brand_id = $1 and m.role in ('brand_admin', 'brand_reviewer')
        order by m.active desc, m.role, p.email`,
      [access.brand.id],
    ),
    pendingInvitations(access.brand.id),
    brandFranchiseePeople(access.brand.id),
    getRegistrationsForBrand(access.brand.id),
  ]);

  const people: PersonRow[] = members.map((row) => ({
    membershipId: row.membership_id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    isSelf: row.profile_id === access.viewer.profile.id,
  }));
  const invited: InvitedRow[] = invitations
    .filter((row) => row.role === 'brand_admin' || row.role === 'brand_reviewer')
    .map((row) => ({ ...row, role: row.role as InvitedRow['role'] }));

  return (
    <>
      <People
        brandSlug={access.brand.slug}
        brandName={access.brand.name}
        people={people}
        invited={invited}
      />
      <div className="mt-8">
        <Franchisees
          brandSlug={access.brand.slug}
          brandName={access.brand.name}
          franchisees={franchisees}
          registrations={registrations}
        />
      </div>
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
function Metrics({
  metrics,
  approvalsHref,
}: {
  metrics: PortfolioMetrics;
  approvalsHref: string;
}) {
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
        {tiles.map(([label, value, alert]) => {
          const body = (
            <>
              <p
                className="text-lg font-semibold tabular-nums"
                style={{ color: alert ? '#B45309' : 'var(--color-brand-dark)' }}
              >
                {value}
              </p>
              <p className="text-[11px] text-gray-500">{label}</p>
              {alert && (
                <p className="mt-1 text-[11px] font-semibold text-amber-800">Review now →</p>
              )}
            </>
          );
          // Approvals waiting is the one tile that asks something of corporate,
          // so it is the way in to the queue rather than a second banner below.
          return alert ? (
            <div
              key={label}
              className="card-lift rounded-xl border border-amber-300 bg-amber-50 text-center transition-colors hover:bg-amber-100"
            >
              <Link href={approvalsHref} className="block p-3">
                {body}
              </Link>
            </div>
          ) : (
            <div
              key={label}
              className="rounded-xl border border-gray-200 bg-white p-3 text-center max-sm:last:col-span-2"
            >
              {body}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
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
      <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500">
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
function LocationCard({
  location,
  approvalsHref,
}: {
  location: PortfolioLocation;
  approvalsHref: string;
}) {
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
        <span className="text-gray-500">{location.format_label}</span>
        {opening && (
          <span className={urgent ? 'font-medium text-amber-700' : ''}>
            opens {opening.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {urgent && daysOut !== null && (daysOut >= 0 ? ` · ${daysOut} days` : ' · overdue')}
          </span>
        )}
        {location.oldest_install && (
          <span className="text-gray-500">
            oldest sign {new Date(location.oldest_install).getFullYear()}
          </span>
        )}
      </div>

      {/* Each open request on its own line, so a status reads against its
          code, with the same six stages the franchisee sees on their store. */}
      {location.open_requests.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {location.open_requests.map((request) => {
            const progress = setupProgress(request.status);
            return (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2.5 text-xs [&:not(:last-child)]:pb-2.5"
              >
                <span className="w-20 font-medium tabular-nums text-gray-900">{request.code}</span>
                {progress && <StageBar current={progress.current} />}
                <RequestStatusChip status={request.status} />
                {request.pending_count > 0 ? (
                  <Link
                    href={approvalsHref}
                    className="ml-auto font-semibold text-amber-800 underline-offset-2 hover:underline"
                  >
                    {request.pending_count} awaiting you →
                  </Link>
                ) : (
                  request.status === 'submitted' && (
                    // Not corporate's yet: the review opens at package prep (SPEC §6).
                    <span className="ml-auto text-gray-500">
                      Signage.com is preparing the package
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The six stages as a compact bar, the stage under way named beside it. */
function StageBar({ current }: { current: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden="true">
        {SETUP_STAGES.map((stage, index) => (
          <span
            key={stage}
            className="h-1.5 w-5 rounded-full"
            style={{
              background: index <= current ? 'var(--color-brand)' : '#e5e7eb',
              opacity: index === current ? 0.55 : 1,
            }}
          />
        ))}
      </span>
      <span className="text-gray-600">
        <span className="sr-only">
          Step {current + 1} of {SETUP_STAGES.length}:{' '}
        </span>
        {SETUP_STAGES[current]}
      </span>
    </span>
  );
}

/**
 * The §8b budget one-pager, in the hands of the person SPEC §8b names. The
 * download route checks the signed-in role on the brand (DECISIONS #44, #127).
 */
function BudgetDocuments({
  brand,
  formats,
}: {
  brand: BrandPublic;
  formats: { key: LocationFormat; label: string }[];
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
            key={format.key}
            href={`/api/documents/budget/${brand.slug}/${format.key}`}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
          >
            {format.label} budget PDF ↓
          </a>
        ))}
      </div>
    </section>
  );
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
