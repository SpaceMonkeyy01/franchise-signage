// Add signs to an existing location (docs/flow-demo.jsx step "addpick").

import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireStoreOrdering } from '@/lib/auth/stores';
import {
  getBrandBySlug,
  getBrandCatalog,
  getInstalledSignsForLocation,
  getLocationById,
} from '@/lib/db/queries';

import { AddForm } from './AddForm';
import { suitsStore } from '@/lib/catalog/fit';
import { storeName } from '@/lib/format';

export default async function AddSignsPage({
  params,
}: {
  params: Promise<{ brand: string; locationId: string }>;
}) {
  const { brand: slug, locationId } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const location = await getLocationById(locationId);
  if (!location || location.brand_id !== brand.id) notFound();
  // SPEC v2.3 §10.2: an owner, the staff assigned to this store, or Signage.com.
  const { viewer } = await requireStoreOrdering(
    slug,
    locationId,
    `/${slug}/location/${locationId}/request/add`,
  );

  const [catalog, installed] = await Promise.all([
    getBrandCatalog(brand.id),
    getInstalledSignsForLocation(locationId),
  ]);
  const installedItemIds = installed.map((sign) => sign.brand_item_id);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}/location/${locationId}/request`}
        account={<AccountBadge name={viewer.profile.name} email={viewer.profile.email} />}
      />

      <main className="mx-auto w-full page-narrow flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          Add signs to {storeName(location.name, brand.name)}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          From the approved {brand.name} catalog — every item carries a locked brand spec. New
          additions need corporate approval.
        </p>

        <AddForm
          brand={brand}
          locationId={locationId}
          // No drive-thru signs for a store without a lane (DECISIONS #197).
          catalog={catalog.filter((item) => suitsStore(item.sign_type, location.format))}
          installedItemIds={installedItemIds}
        />
      </main>
    </>
  );
}
