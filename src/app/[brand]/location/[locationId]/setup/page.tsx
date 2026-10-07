// The first order for a store already on record (an existing store with no
// order yet): the initial-setup checklist against that store, so its standard
// package loads and auto-approves as it does for a new store (SPEC §7). Once a
// store has started, its orders go through "Request signage".

import { notFound, redirect } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireStoreOrdering } from '@/lib/auth/stores';
import {
  getBrandBySlug,
  getBrandCatalog,
  getPackagesForBrand,
  getStoreForFirstOrder,
} from '@/lib/db/queries';

import { SetupWizard } from '../../../setup/SetupWizard';

export default async function FirstOrderPage({
  params,
}: {
  params: Promise<{ brand: string; locationId: string }>;
}) {
  const { brand: slug, locationId } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const store = await getStoreForFirstOrder(locationId);
  if (!store || store.brand_id !== brand.id) notFound();
  const { viewer } = await requireStoreOrdering(slug, locationId, `/${slug}/location/${locationId}/setup`);
  if (store.started) redirect(`/${slug}/location/${locationId}/request`);

  const [packages, catalog] = await Promise.all([getPackagesForBrand(brand.id), getBrandCatalog(brand.id)]);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}`}
        account={<AccountBadge name={viewer.profile.name} email={viewer.profile.email} />}
      />
      <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
        <SetupWizard
          brand={brand}
          packages={packages}
          catalog={catalog}
          requester={{
            name: viewer.profile.name ?? '',
            email: viewer.profile.email,
            phone: viewer.profile.phone ?? '',
          }}
          existing={{ id: store.id, name: store.name, address: store.address, format: store.format }}
        />
      </main>
    </>
  );
}
