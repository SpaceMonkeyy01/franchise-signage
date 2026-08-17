// Initial setup — the first request a location ever makes (SPEC §9 interface 1).
//
// Four steps, exactly as docs/flow-demo.jsx walks them: tell us about the site,
// confirm the package that loads from its format, add anything beyond it, review
// and submit. The whole point of the shape is that step 2 is a checklist and not
// a form — the brand specs are already decided, and the franchisee only supplies
// what is true of their site.

import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { getBrandBySlug, getBrandCatalog, getPackagesForBrand } from '@/lib/db/queries';

import { SetupWizard } from './SetupWizard';

export default async function SetupPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const [packages, catalog] = await Promise.all([
    getPackagesForBrand(brand.id),
    getBrandCatalog(brand.id),
  ]);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} backHref={`/${slug}`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <SetupWizard brand={brand} packages={packages} catalog={catalog} />
      </main>
    </>
  );
}
