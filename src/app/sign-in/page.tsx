// Sign in (SPEC v2.3 §10.3.3).
//
// One page for every account in phase A. Brand portals (§10.4, phase D) will
// put their own chrome around the same form at `{brand}.signage.com`. There is
// no "sign up" link, on purpose: accounts exist only by invitation.

import { redirect } from 'next/navigation';

import { AuthCard, FormNotice } from '@/components/AuthCard';
import { getViewer, homeFor, owesSecondFactor, safeNext } from '@/lib/auth/access';
import { DEV_ADMIN, DEV_FRANCHISEE } from '@/lib/auth/dev-auth';
import { authProvider } from '@/lib/auth/identity';

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

  // Already signed in: go on, unless the destination is exactly what this
  // account cannot open — then say so, rather than looping between the two.
  if (viewer && reason !== 'not_member' && reason !== 'expired') {
    if (owesSecondFactor(viewer)) {
      redirect(`/two-factor?next=${encodeURIComponent(safeNext(next, homeFor(viewer.memberships)))}`);
    }
    redirect(safeNext(next, homeFor(viewer.memberships)));
  }

  const devHint =
    authProvider() === 'dev'
      ? `Seeded accounts: Signage.com ${DEV_ADMIN.email} / ${DEV_ADMIN.password}; franchisee ${DEV_FRANCHISEE.email} / ${DEV_FRANCHISEE.password}.`
      : null;

  return (
    <AuthCard
      title="Sign in"
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
}
