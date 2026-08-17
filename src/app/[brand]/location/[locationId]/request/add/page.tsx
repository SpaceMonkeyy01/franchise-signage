// Add signs to an existing location (docs/flow-demo.jsx step "addpick").

import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import {
  getBrandBySlug,
  getBrandCatalog,
  getInstalledSignsForLocation,
  getLocationById,
} from '@/lib/db/queries';

import { AddForm } from './AddForm';

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

  const [catalog, installed] = await Promise.all([
    getBrandCatalog(brand.id),
    getInstalledSignsForLocation(locationId),
  ]);
  const installedItemIds = installed.map((sign) => sign.brand_item_id);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} backHref={`/${slug}/location/${locationId}/request`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          Add signs to {location.name.split('—').pop()?.trim() || location.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          From the approved {brand.name} catalog — every item carries a locked brand spec. New
          additions need corporate approval.
        </p>

        <AddForm
          brand={brand}
          locationId={locationId}
          catalog={catalog}
          installedItemIds={installedItemIds}
        />
      </main>
    </>
  );
}
