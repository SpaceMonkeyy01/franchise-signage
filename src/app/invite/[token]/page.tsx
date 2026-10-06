// An invitation, opened (SPEC v2.3 §10.3.2).
//
// Opening it decides nothing — mail scanners follow links — so the page only
// shows the form. Accepting is the button, in a Server Action.

import Link from 'next/link';

import { AuthCard, FormNotice } from '@/components/AuthCard';
import { BrandTheme } from '@/components/BrandChrome';
import { resolveInvitation, ROLE_LABEL } from '@/lib/auth/invitations';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';

import { AcceptForm } from './AcceptForm';

export const dynamic = 'force-dynamic';

const DEAD: Record<string, { title: string; body: string }> = {
  accepted: {
    title: 'Already accepted',
    body: 'This invitation has been used. Sign in with the password you chose.',
  },
  revoked: {
    title: 'Invitation withdrawn',
    body: 'This invitation was replaced or withdrawn. If you were sent a newer one, use that link; otherwise ask whoever invited you to send it again.',
  },
  expired: {
    title: 'Invitation expired',
    body: 'Invitations last 14 days. Ask whoever invited you to send it again.',
  },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await resolveInvitation(token);

  if (!invitation) {
    return (
      <AuthCard
        title="This link isn't valid"
        subtitle="Check that you opened the whole link from the email."
      >
        <SignInLink />
      </AuthCard>
    );
  }

  if (invitation.status !== 'pending') {
    const dead = DEAD[invitation.status];
    return (
      <AuthCard title={dead.title}>
        <div className="space-y-4">
          <FormNotice>{dead.body}</FormNotice>
          <SignInLink />
        </div>
      </AuthCard>
    );
  }

  const where = invitation.brandName ?? 'Signage.com';
  const hasAccount = invitation.existingProfileId !== null;

  return (
    <>
      {/* A brand's invitation wears its colours; Signage.com's stays blue. */}
      {invitation.brandSlug && <BrandTheme brand={{ brand_colors: invitation.brandColors ?? {} }} />}
      <AuthCard
        eyebrow={
          invitation.brandName ? `${invitation.brandName} · Franchise by Signage` : undefined
        }
        title={hasAccount ? `Add ${where} to your account` : 'Create your account'}
        subtitle={
          <>
            You&rsquo;ve been invited as <strong>{ROLE_LABEL[invitation.role]}</strong>
            {invitation.brandName ? ` for ${invitation.brandName}` : ''}.{' '}
            {hasAccount
              ? 'You already have an account — sign in to accept.'
              : 'Choose a password; you’ll use it to sign in from now on.'}
          </>
        }
      >
        <AcceptForm
          token={token}
          email={invitation.email}
          hasAccount={hasAccount}
          askCompany={invitation.role === 'franchisee_owner' && !invitation.franchiseeId}
          askSite={invitation.role === 'franchisee_owner'}
          brandName={invitation.brandName}
          minPassword={PASSWORD_MIN_LENGTH}
        />
      </AuthCard>
    </>
  );
}

function SignInLink() {
  return (
    <Link
      href="/sign-in"
      className="block text-center text-sm font-medium text-gray-900 hover:underline"
    >
      Go to sign in
    </Link>
  );
}
