// Two-factor (SPEC v2.3 §10.3.3, §10.7 D8).
//
// Reached after a password sign-in when the account requires it, and after
// accepting a Signage.com invitation, where enrolment is the last step of
// setting up. A session that has already passed it goes straight on.

import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/AuthCard';
import { SignageLogo } from '@/components/SignageLogo';
import { getViewer, homeFor, requiresSecondFactor, safeNext } from '@/lib/auth/access';
import { portalSlug } from '@/lib/portal-request';
import { devCurrentCode, totpFactors } from '@/lib/auth/identity';

import { SignOutButton } from '../sign-in/SignOutButton';
import { TwoFactorForm } from './TwoFactorForm';

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ''}`);

  const destination = safeNext(next, homeFor(viewer.memberships, await portalSlug()));
  if (viewer.identity.aal === 'aal2') redirect(destination);

  const verified = (await totpFactors()).find((factor) => factor.verified) ?? null;
  const required = requiresSecondFactor(viewer.memberships);

  return (
    <AuthCard
      logo={
        viewer.memberships.some((m) => m.role === 'platform_admin') && !(await portalSlug()) ? (
          <SignageLogo className="h-7 w-auto" />
        ) : undefined
      }
      title={verified ? 'Enter your code' : 'Set up two-factor sign-in'}
      subtitle={
        verified
          ? 'Open your authenticator app and enter the six-digit code for this account.'
          : required
            ? 'Your account can reach every brand, so it needs a second step at sign-in: a code from an app on your phone.'
            : 'Add a code from an app on your phone to your sign-in.'
      }
      footer={
        <div className="space-y-3">
          {verified && (
            <p className="text-xs leading-relaxed text-gray-500">
              Lost your phone? Ask another Signage.com admin to reset your two-factor from the Team
              page, then sign in and set it up again.
            </p>
          )}
          <SignOutButton />
        </div>
      }
    >
      <TwoFactorForm
        mode={verified ? 'challenge' : 'enroll'}
        factorId={verified?.id ?? null}
        next={destination}
        devCode={verified ? await devCurrentCode(verified.id) : null}
      />
    </AuthCard>
  );
}
