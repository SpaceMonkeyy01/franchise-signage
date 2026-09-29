// Sign in (SPEC v2.3 §10.3.3).
//
// One page for every account. On a brand portal (§10.4) — `{brand}.signage.com`,
// or `freshbites.localhost` in development — the same form wears the brand's
// header and colours, and signing in lands on that brand. There is no "sign
// up" link, on purpose: accounts exist only by invitation.

import { redirect } from 'next/navigation';

import { AuthCard, FormNotice } from '@/components/AuthCard';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { getViewer, homeFor, owesSecondFactor, safeNext } from '@/lib/auth/access';
import { getBrandBySlug } from '@/lib/db/queries';
import { portalSlug } from '@/lib/portal-request';

import { devSignInHint } from './dev-hint';
import { SignInForm } from './SignInForm';
import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

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
  const brand = portal ? await getBrandBySlug(portal) : null;

  // Already signed in: go on, unless the destination is exactly what this
  // account cannot open — then say so, rather than looping between the two.
  if (viewer && reason !== 'not_member' && reason !== 'expired') {
    if (owesSecondFactor(viewer)) {
      redirect(`/two-factor?next=${encodeURIComponent(safeNext(next, homeFor(viewer.memberships, portal)))}`);
    }
    redirect(safeNext(next, homeFor(viewer.memberships, portal)));
  }

  const devHint = devSignInHint();

  const card = (
    <AuthCard
      title={brand ? `Sign in to ${brand.name} signage` : 'Sign in'}
      eyebrow={brand ? `${brand.name} · Franchise by Signage` : undefined}
      subtitle="Accounts are created by invitation. If you were invited, open the email to set your password first."
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
