// The brand admin designs a sign in the Design Studio (SPEC v2.6 §8): logo,
// options and size, priced live by Signage.com's engine, and what a
// franchisee may change. Brand admins only; reviewers see the Signs tab.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireCorporate } from '@/lib/auth/corporate';
import { getDesignableSign, offeredOptions, studioDesigns, studioPrices } from '@/lib/designs/studio';
import { engineConfigured } from '@/lib/signize/client';

import { StudioEditor } from './StudioEditor';

export const metadata = { title: 'Design Studio' };

export default async function DesignPage({
  params,
}: {
  params: Promise<{ brand: string; itemId: string }>;
}) {
  const { brand: slug, itemId } = await params;
  const access = await requireCorporate(slug, `/${slug}/corporate/design/${itemId}`);
  if (!access.canManage) notFound();
  const sign = await getDesignableSign(itemId, access.brand.id);
  if (!sign) notFound();

  const back = `/${slug}/corporate?tab=signs`;
  const priceable = studioPrices(sign);

  return (
    <>
      <BrandTheme brand={access.brand} />
      <BrandHeader
        brand={access.brand}
        account={<AccountBadge name={access.viewer.profile.name} email={access.viewer.profile.email} />}
      />
      <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
        <Link href={back} className="text-sm text-gray-500 underline-offset-2 hover:underline">
          ← Signs
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-gray-900">Design {sign.name}</h1>
        <p className="text-sm text-gray-500">
          {!studioDesigns(sign)
            ? sign.sign_type
            : sign.price_mode === 'fixed'
            ? `${sign.sign_type} · Signage.com sets this sign's price. Set the logo and size and the Studio draws it, so every store sees the sign it is ordering.`
            : priceable
            ? `${sign.sign_type} · Set the logo, options and size; Signage.com prices it as you go. Then choose what a franchisee may adjust for their store — anything else stays exactly as you set it.`
            : `${sign.sign_type} · Signage.com quotes this sign per order, so it stays a custom quote. Set the logo and size and the Studio draws it, so every store sees the sign it is ordering.`}
        </p>

        {!studioDesigns(sign) ? (
          <p className="mt-6 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            The Studio has no drawing style for {sign.sign_type} yet. It stays a custom quote, shown with its
            standard picture.
          </p>
        ) : !engineConfigured() ? (
          <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            The Design Studio is not connected right now. Your signs, packages and prices work as before.
          </p>
        ) : (
          <StudioEditor
            brandSlug={slug}
            itemId={sign.id}
            hasBrandLogo={!!access.brand.logo_url}
            priced={priceable}
            options={offeredOptions(sign)}
            saved={sign.design}
            savedRules={sign.design_rules}
            pinned={sign.pinned_attributes}
          />
        )}
      </main>
    </>
  );
}
