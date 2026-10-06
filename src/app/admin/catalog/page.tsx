// The catalog, from Signage.com's side (SPEC v2.4 §2.3).
//
// Three jobs, one tab each: brands' proposals waiting on a price, one brand's
// signs (prices, retire and reinstate), and the master catalog every brand
// builds from. Prices are set here and nowhere else. It opens on the review
// queue when something is waiting, otherwise on the brand's signs.

import Link from 'next/link';

import { ImageUpload } from '@/components/ImageUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { requireTeamMember } from '@/lib/auth/team';
import {
  attributeLabel,
  catalogHistory,
  listBrandSigns,
  listMasterCatalog,
  listPendingSigns,
  PRICE_MODE_LABEL,
  signStatus as statusOf,
  type PriceMode,
} from '@/lib/catalog/manage';
import type { SignDetails } from '@/lib/catalog/details';
import { brandSignDetails } from '@/lib/catalog/details';
import { getBrandsPublic, getBrandsWithPackages } from '@/lib/db/queries';

import { setSignImageAction } from './actions';

import { PriceEditor, ReviewForm, SignActiveToggle } from './CatalogControls';
import { MasterCatalog } from './MasterCatalog';

export const metadata = { title: 'Catalog · Signage.com' };

type Tab = 'review' | 'brand' | 'catalog';

function Pins({ pinned }: { pinned: Record<string, unknown> }) {
  const entries = Object.entries(pinned);
  if (entries.length === 0) return <p className="text-xs text-gray-500">No locked choices.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
      {entries.map(([attribute, value]) => (
        <div key={attribute} className="flex gap-1.5">
          <dt className="text-gray-500">{attributeLabel(attribute)}:</dt>
          <dd className="text-gray-900">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function variantName(row: { sign_type: string; variant: string | null }) {
  return row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
}

/** A live fixed-price sign the team has not priced: franchisees would see a custom quote. */
function needsPrice(sign: { price_mode: PriceMode; est_price: string | null; review_status: string; active: boolean }) {
  return sign.price_mode === 'fixed' && sign.est_price === null && sign.review_status === 'approved' && sign.active;
}

const MODE_TONE: Record<PriceMode, string> = {
  studio: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  fixed: 'bg-sky-50 text-sky-800 ring-sky-200',
  custom: 'bg-amber-50 text-amber-800 ring-amber-200',
};

function ModeBadge({ mode }: { mode: PriceMode }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${MODE_TONE[mode]}`}>
      {PRICE_MODE_LABEL[mode]}
    </span>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; tab?: string }>;
}) {
  await requireTeamMember();
  const { brand: brandParam, tab: tabParam } = await searchParams;

  const [pending, brands, master, history, packaged] = await Promise.all([
    listPendingSigns(),
    getBrandsPublic(),
    listMasterCatalog(),
    catalogHistory(null, 12),
    getBrandsWithPackages(),
  ]);
  const brand = brands.find((b) => b.slug === brandParam) ?? brands[0] ?? null;
  const signs = brand ? await listBrandSigns(brand.id) : [];
  const details = brand ? await brandSignDetails(brand.id, signs) : new Map();
  const categories = [...new Set(master.map((row) => row.category))].sort();
  const unpriced = signs.filter(needsPrice);
  const formats = packaged.find((b) => b.id === brand?.id)?.formats ?? [];

  const tab: Tab =
    tabParam === 'review' || tabParam === 'brand' || tabParam === 'catalog'
      ? tabParam
      : pending.length > 0
        ? 'review'
        : 'brand';
  const href = (next: Tab) => `/admin/catalog?tab=${next}${brand ? `&brand=${brand.slug}` : ''}`;

  return (
    <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">Catalog</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
        Every brand builds its signs from the Signage.com catalog. Brands propose new signs and edit
        their own packages; prices are set here, and only here.
      </p>

      <nav className="mt-6 flex gap-1 border-b border-gray-200" aria-label="Catalog sections">
        <TabLink href={href('review')} active={tab === 'review'} count={pending.length} alert={pending.length > 0}>
          Waiting for review
        </TabLink>
        <TabLink href={href('brand')} active={tab === 'brand'} count={signs.length} alert={unpriced.length > 0}>
          Brand signs
        </TabLink>
        <TabLink href={href('catalog')} active={tab === 'catalog'} count={master.length}>
          Signage.com catalog
        </TabLink>
      </nav>

      {tab === 'review' && (
        <section className="mt-6">
          {pending.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No brand has a sign waiting. Proposals from a brand&apos;s Signs tab arrive here.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((sign) => (
                <article key={sign.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <SignThumbnail renderKey={sign.render_key} imagePath={sign.image_path} label={sign.name} className="h-14 w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{sign.brand_name}</p>
                      <p className="text-sm font-semibold text-gray-900">{sign.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        {variantName(sign)} · {sign.placement} <ModeBadge mode={sign.price_mode} />
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Proposed by {sign.submitted_by ?? 'the brand'}
                        {sign.submitted_at && ` on ${new Date(sign.submitted_at).toLocaleDateString('en-US')}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                    <Pins pinned={sign.pinned_attributes} />
                    {sign.submission_note && (
                      <p className="mt-2 text-xs text-gray-700">
                        <span className="text-gray-500">Note: </span>
                        {sign.submission_note}
                      </p>
                    )}
                  </div>
                  <ReviewForm
                    itemId={sign.id}
                    name={sign.name}
                    specSummary={sign.spec_summary ?? ''}
                    mode={sign.price_mode}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'brand' && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1.5" aria-label="Brand">
              {brands.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/catalog?tab=brand&brand=${b.slug}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    b.id === brand?.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {b.name}
                </Link>
              ))}
            </nav>
            <p className="text-xs text-gray-500">
              A price change applies to new requests; ones already made keep their price.
            </p>
          </div>
          {unpriced.length > 0 && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              {unpriced.length === 1
                ? '1 fixed-price sign has no price yet, so franchisees see it as a custom quote.'
                : `${unpriced.length} fixed-price signs have no price yet, so franchisees see them as custom quotes.`}{' '}
              Use <strong>Set price</strong> on the highlighted {unpriced.length === 1 ? 'row' : 'rows'}.
            </p>
          )}
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Sign</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Price from</th>
                  <th className="px-3 py-2.5 font-medium">Price</th>
                  <th className="px-3 py-2.5 text-right font-medium">Installed</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {signs.map((sign) => {
                  const status = statusOf(sign);
                  return (
                    <tr key={sign.id} className={needsPrice(sign) ? 'bg-amber-50/50' : 'hover:bg-gray-50/60'}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-3">
                          <ImageUpload hasImage={!!sign.thumbnail_url} save={setSignImageAction.bind(null, sign.id)}>
                            <SignThumbnail
                              renderKey={sign.render_key}
                              imagePath={sign.image_path}
                              label={sign.name}
                              className="block h-10 w-14 rounded-md"
                            />
                          </ImageUpload>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{sign.name}</p>
                            <p className="truncate text-xs text-gray-500">{variantName(sign)}</p>
                            <SignExtras details={details.get(sign.id)} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ModeBadge mode={sign.price_mode} />
                      </td>
                      <td className="px-3 py-2.5">
                        {sign.review_status === 'approved' ? (
                          <PriceEditor
                            itemId={sign.id}
                            price={sign.est_price}
                            mode={sign.price_mode}
                            engine={sign.price_source === 'engine'}
                          />
                        ) : (
                          <span className="text-xs text-gray-500">set on approval</span>
                        )}
                        <EngineLine engine={details.get(sign.id)?.engine ?? null} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{sign.installed}</td>
                      <td className="px-4 py-2.5 text-right">
                        {sign.review_status === 'approved' && (
                          <SignActiveToggle itemId={sign.id} name={sign.name} active={sign.active} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {signs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                      This brand has no signs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* The §8b budget one-pager: a format's standard package priced, for a
              candidate's loan application before any site exists. Moved here
              from the queue (DECISIONS #191): it is about packages, not requests. */}
          {brand && formats.length > 0 && (
            <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Brand documents</h2>
              <p className="mt-1 text-xs text-gray-500">
                The budget sheet a franchise candidate takes to their lender: {brand.name}&rsquo;s standard
                package prices for one store type. An estimate, not a quote.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {formats.map((format) => (
                  <a
                    key={format.key}
                    href={`/api/documents/budget/${brand.slug}/${format.key}`}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
                  >
                    {format.label} budget PDF
                  </a>
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {tab === 'catalog' && (
        <section className="mt-6">
          <MasterCatalog rows={master} categories={categories} />

          {history.length > 0 && (
            <details className="mt-8 rounded-xl border border-gray-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">
                Recent catalog changes
              </summary>
              <ul className="divide-y divide-gray-100 border-t border-gray-100 text-xs text-gray-700">
                {history.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-3 px-4 py-2">
                    <span className="w-36 shrink-0 text-gray-500">
                      {new Date(event.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="min-w-0 flex-1">{event.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

const money = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

/** Under a sign's name: the packages it is in, and its history folded away. */
function SignExtras({ details }: { details: SignDetails | undefined }) {
  if (!details) return null;
  return (
    <div className="mt-1 space-y-1">
      {details.packages.length > 0 ? (
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
          In
          {details.packages.map((pkg) => (
            <span key={pkg.label} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
              {pkg.label}
              {pkg.count > 1 && ` ×${pkg.count}`}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-[11px] text-gray-400">Not in a standard package: an add-on</p>
      )}
      {details.history.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-800">History ({details.history.length})</summary>
          <ul className="mt-1 space-y-0.5 border-l border-gray-200 pl-2 text-gray-600">
            {details.history.map((event) => (
              <li key={event.id}>
                <span className="text-gray-400">
                  {new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>{' '}
                {event.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Under a Studio price: Signize's cost and the margin on it, team only. */
function EngineLine({ engine }: { engine: SignDetails['engine'] }) {
  if (!engine) return null;
  const drift = engine.priceToday !== null && Math.round(engine.priceToday) !== Math.round(engine.price);
  return (
    <p className="mt-0.5 text-[11px] text-gray-500" title="Signize's cost for the saved design, and the margin applied">
      cost {money(engine.cost)} · {engine.marginPercent}% margin
      {drift && (
        <span className="block text-amber-800">
          {money(engine.priceToday!)} at today&rsquo;s {engine.marginToday}%; re-save the design to apply
        </span>
      )}
    </p>
  );
}

function TabLink({
  href,
  active,
  count,
  alert = false,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          alert ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
