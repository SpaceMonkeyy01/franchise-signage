// The way in to the corporate dashboard (SPEC §10).
//
// A franchisor's reviewer gets their first link in an email; this page is for
// every time after that — the bookmark expired, they are on a different laptop,
// or the person who held it has left. It asks for an address and says the same
// sentence to everyone.

import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { getBrandBySlug } from '@/lib/db/queries';

import { RequestLinkForm } from './RequestLinkForm';

export default async function CorporateEntry({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} backHref={`/${brand.slug}`} />

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {brand.name} corporate
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Signage program dashboard</h1>
        <p className="mt-2 mb-6 text-sm leading-relaxed text-gray-600">
          Every {brand.name} location, what is installed, what is in flight, and what the program
          has cost. Read-only — approvals stay in the emails sent to your reviewer.
        </p>

        <RequestLinkForm brandSlug={brand.slug} brandName={brand.name} />

        <p className="mt-6 text-center text-xs text-gray-400">
          Signage.com operates this portal for {brand.name}.
        </p>
      </main>
    </>
  );
}
