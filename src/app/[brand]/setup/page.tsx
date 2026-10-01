// Initial setup — the first request a location ever makes (SPEC §9 interface 1).
//
// Four steps, exactly as docs/flow-demo.jsx walks them: tell us about the site,
// confirm the package that loads from its format, add anything beyond it, review
// and submit. The whole point of the shape is that step 2 is a checklist and not
// a form — the brand specs are already decided, and the franchisee only supplies
// what is true of their site.

import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireStoreCreation } from '@/lib/auth/stores';
import { getBrandBySlug, getBrandCatalog, getPackagesForBrand } from '@/lib/db/queries';

import { SetupWizard } from './SetupWizard';

export default async function SetupPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  // SPEC v2.3 §10.2: starting a store is the owner's (and Signage.com's).
  const { viewer } = await requireStoreCreation(slug);

  const [packages, catalog] = await Promise.all([
    getPackagesForBrand(brand.id),
    getBrandCatalog(brand.id),
  ]);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}`}
        account={<AccountBadge name={viewer.profile.name} email={viewer.profile.email} />}
      />

      <main className="mx-auto w-full page-narrow flex-1 px-4 py-8 sm:px-6">
        <SetupWizard
          brand={brand}
          packages={packages}
          catalog={catalog}
          requester={{
            name: viewer.profile.name ?? '',
            email: viewer.profile.email,
            phone: viewer.profile.phone ?? '',
          }}
        />
      </main>
    </>
  );
}
