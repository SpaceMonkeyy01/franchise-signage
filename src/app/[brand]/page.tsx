// The franchisee home (SPEC §9 interface 1): "Your locations".
//
// Locations are permanent entities with a record of installed signs; requests
// are events against them. That is the whole model, and this screen is where a
// franchisee sees it — every sign on their building, and every request in
// flight, in one place.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { SignThumbnail } from '@/components/SignThumbnail';
import { RequestStatusChip } from '@/components/StatusChip';
import { getBrandBySlug, getLocationsForBrand, type LocationRow } from '@/lib/db/queries';

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

  const locations = await getLocationsForBrand(brand.id);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Your <span style={{ color: 'var(--color-brand)' }}>{brand.name}</span> locations
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-600">
            Each location keeps a record of its installed signage — brand specs stay locked, so
            replacements and additions take minutes.
          </p>
        </div>

        {locations.length === 0 ? (
          // The first thing a franchisee with a signed lease and no history
          // sees. "You have no locations" states the obvious back at them; what
          // they need to know is that the next screen is the only form they
          // will ever fill in for this building.
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm leading-relaxed text-gray-600">
            Nothing here yet. Set up your first location below — after that, every replacement and
            addition is picked from what is already on your building.
          </p>
        ) : (
          <div className="space-y-5">
            {locations.map((location) => (
              <LocationCard key={location.id} brandSlug={slug} location={location} />
            ))}
          </div>
        )}

        <Link
          href={`/${slug}/setup`}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
        >
          <StoreIcon /> Set up a new location
        </Link>
      </main>
    </>
  );
}

function LocationCard({ brandSlug, location }: { brandSlug: string; location: LocationRow }) {
  const address = [location.address.line1, location.address.city, location.address.state]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{location.name}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <PinIcon /> {address}
          </p>
        </div>
        <Link
          href={`/${brandSlug}/location/${location.id}/request`}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-brand)' }}
        >
          + Request signage
        </Link>
      </div>

      {location.installed_signs.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {location.installed_signs.map((sign) => (
            <div key={sign.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-2">
              <SignThumbnail
                renderKey={sign.render_key}
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
      ) : (
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
