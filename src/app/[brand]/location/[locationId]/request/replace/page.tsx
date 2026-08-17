// Replace like-for-like (docs/flow-demo.jsx step "replace").
//
// The screen that proves the model: because the location carries a record of
// what is installed, replacing a sign asks two questions instead of re-running
// a project. Everything else — brand item, pinned spec, sizing, price — is read
// off the installed record, and the item auto-approves (SPEC §7).

import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import {
  getBrandBySlug,
  getInstalledSignsForLocation,
  getLocationById,
} from '@/lib/db/queries';

import { ReplaceForm } from './ReplaceForm';

export default async function ReplacePage({
  params,
}: {
  params: Promise<{ brand: string; locationId: string }>;
}) {
  const { brand: slug, locationId } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const location = await getLocationById(locationId);
  if (!location || location.brand_id !== brand.id) notFound();

  const installed = await getInstalledSignsForLocation(locationId);
  if (installed.length === 0) notFound();

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} backHref={`/${slug}/location/${locationId}/request`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">⚡</span>
          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Replace like-for-like</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Brand spec and your sizing are already on file from the original approval — no forms to
          refill, no corporate review.
        </p>

        <ReplaceForm brand={brand} locationId={locationId} installed={installed} />
      </main>
    </>
  );
}
