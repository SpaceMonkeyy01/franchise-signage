// Where an old dashboard link lands (SPEC v2.3 §10.3.4).
//
// Corporate's 30-day dashboard links retired in phase C; the dashboard sits
// behind sign-in. Bookmarks and old emails still point here, so rather than a
// 404 the page says what changed and where to go. It looks nothing up: every
// link was revoked by the migration that retired them, and whether this one was
// ever real makes no difference to the answer.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { getBrandBySlug } from '@/lib/db/queries';

export default async function RetiredDashboardLink({
  params,
}: {
  params: Promise<{ brand: string; token: string }>;
}) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  const dashboard = `/${brand.slug}/corporate`;

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard links have been replaced</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          The {brand.name} signage dashboard now opens when you sign in. You can approve signage
          there too, as well as from the approval emails.
        </p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(dashboard)}`}
          className="mt-6 inline-block w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-brand)' }}
        >
          Sign in
        </Link>
        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          No account yet? Ask your {brand.name} brand admin, or your Signage.com manager, to invite
          you.
        </p>
      </main>
    </>
  );
}
