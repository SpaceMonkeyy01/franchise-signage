// Sign in (SPEC v2.3 §10.3.3).
//
// One page for every account. On a brand portal (§10.4) — `{brand}.signage.com`,
// or `freshbites.localhost` in development — the same form wears the brand's
// header and colours, and signing in lands on that brand. There is no "sign
// up" link, on purpose: accounts exist only by invitation.

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthCard, FormNotice } from '@/components/AuthCard';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { SignageLogo } from '@/components/SignageLogo';
import { getViewer, homeFor, owesSecondFactor, safeNext } from '@/lib/auth/access';
import { getBrandBySlug } from '@/lib/db/queries';
import { portalSlug } from '@/lib/portal-request';

import { devSignInHint } from './dev-hint';
import { SignInForm } from './SignInForm';
import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

/** The first path segment of a same-site `next`, which may be a brand's slug. */
function brandInNext(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  const segment = next.split(/[/?#]/)[1] ?? '';
  return /^[a-z0-9-]+$/.test(segment) ? segment : null;
}

const REASONS: Record<string, string> = {
  expired: 'For security, Signage.com sessions end after 12 hours. Sign in again to continue.',
  reset: 'Your password has been changed. Sign in with the new one.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const viewer = await getViewer();
  const portal = await portalSlug();
  // Whose sign-in this is. A brand portal is that brand's; so is the main
  // address when the destination is one of a brand's pages (the "sign in to
  // accept" link on a request, the path-based fallback). Everything else is
  // Signage.com's own. Only the look changes: the account decides where it lands.
  const brandSlug = portal ?? brandInNext(next);
  const brand = brandSlug ? await getBrandBySlug(brandSlug) : null;

  // Already signed in: go on, unless the destination is exactly what this
  // account cannot open — then say so, rather than looping between the two.
  if (viewer && reason !== 'not_member' && reason !== 'expired') {
    if (owesSecondFactor(viewer)) {
      redirect(`/two-factor?next=${encodeURIComponent(safeNext(next, homeFor(viewer.memberships, portal)))}`);
    }
    redirect(safeNext(next, homeFor(viewer.memberships, portal)));
  }

  const devHint = devSignInHint(brand ? 'brand' : 'platform');

  const card = (
    <AuthCard
      title={brand ? `Sign in to ${brand.name} signage` : 'Sign in to Signage.com'}
      eyebrow={brand ? `${brand.name} · Franchise by Signage` : 'Signage.com team · Franchise by Signage'}
      logo={brand ? undefined : <SignageLogo className="h-7 w-auto" />}
      subtitle={
        brand
          ? 'Accounts are created by invitation. If you were invited, open the email to set your password first.'
          : 'For the Signage.com team. Franchisees and brand corporate sign in on their brand’s own page.'
      }
      footer={
        brand ? undefined : (
          <Link href="/" className="text-xs underline underline-offset-2 hover:text-gray-900">
            Signing in for a brand? Choose it on the front page
          </Link>
        )
      }
    >
      {reason === 'not_member' && viewer ? (
        <div className="space-y-4">
          <FormNotice>
            You&rsquo;re signed in as {viewer.profile.email}, which has no access to that page.
          </FormNotice>
          <SignOutButton />
        </div>
      ) : (
        <div className="space-y-4">
          {reason && REASONS[reason] && <FormNotice>{REASONS[reason]}</FormNotice>}
          <SignInForm next={next ?? null} devHint={devHint} />
        </div>
      )}
    </AuthCard>
  );

  if (!brand) return card;
  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader brand={brand} />
      {card}
    </>
  );
}
