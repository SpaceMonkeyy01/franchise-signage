// Edit a store's details (DECISIONS #177): name, address, opening date, and
// store type — the type only before the store's first order, unless it is
// Signage.com editing. Owners of the store's company and Signage.com only.

import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireStoreOrdering } from '@/lib/auth/stores';
import { getBrandBySlug } from '@/lib/db/queries';
import { mayChangeType } from '@/lib/stores/changes';
import { getEditableStore, getStoreHistory } from '@/lib/stores/edit';

import { StoreEditForm } from './StoreEditForm';

export const metadata = { title: 'Edit store' };

export default async function EditStorePage({
  params,
}: {
  params: Promise<{ brand: string; locationId: string }>;
}) {
  const { brand: slug, locationId } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const store = await getEditableStore(locationId);
  if (!store || store.brand_id !== brand.id) notFound();
  const { viewer, scope } = await requireStoreOrdering(slug, locationId, `/${slug}/location/${locationId}/edit`);
  if (scope.kind === 'none' || !scope.canCreateStore) notFound();
  const isTeam = scope.kind === 'all';
  const history = await getStoreHistory(locationId);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}`}
        account={<AccountBadge name={viewer.profile.name} email={viewer.profile.email} />}
      />
      <main className="mx-auto w-full page-narrow flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900">Edit store</h1>
        <p className="mt-1 text-sm text-gray-500">
          Changes apply to this store&rsquo;s record. Orders already placed are not affected.
        </p>
        <StoreEditForm
          brandSlug={slug}
          locationId={locationId}
          initial={store.fields}
          types={store.types}
          typeLocked={!mayChangeType(store.started, isTeam)}
          teamOverride={isTeam && store.started}
        />

        {history.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">Change history</h2>
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {history.map((event) => (
                <li key={event.id} className="px-4 py-2.5 text-sm">
                  <p className="text-gray-800">{event.summary}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {event.actor_label} ·{' '}
                    {new Date(event.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
