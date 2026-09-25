// Choosing a new password from an emailed link (SPEC v2.3 §10.3.3).

import Link from 'next/link';

import { AuthCard, FormNotice } from '@/components/AuthCard';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { resolvePasswordReset } from '@/lib/auth/password-reset';

import { ResetForm } from './ResetForm';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await resolvePasswordReset(token);

  if (!reset) {
    return (
      <AuthCard title="This link has expired">
        <div className="space-y-4">
          <FormNotice>
            Reset links work once, for an hour, and a newer request replaces an older link. Ask for
            a new one.
          </FormNotice>
          <Link
            href="/forgot-password"
            className="block text-center text-sm font-medium text-gray-900 hover:underline"
          >
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle={`For ${reset.email}.`}>
      <ResetForm token={token} minPassword={PASSWORD_MIN_LENGTH} />
    </AuthCard>
  );
}
