'use client';

// The row actions on People: the same four Team had for Signage.com admins,
// now for every account, plus the welcome resend for a registration.

import { useState, useTransition } from 'react';

import {
  clearLockoutAction,
  resendWelcomeAction,
  resetTwoFactorAction,
  setAccountActiveAction,
  withdrawInvitationAction,
} from './actions';

function ActionButton({
  label,
  confirmText,
  run,
  tone = 'default',
}: {
  label: string;
  confirmText?: string;
  run: () => Promise<{ error: string } | undefined>;
  tone?: 'default' | 'danger';
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          startTransition(async () => {
            const failure = await run();
            if (failure) setError(failure.error);
          });
        }}
        className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${
          tone === 'danger' ? 'text-rose-700' : 'text-gray-600'
        }`}
      >
        {pending ? '…' : label}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </>
  );
}

export function AccountActions({
  membershipId,
  profileId,
  email,
  active,
  locked,
  isSelf,
  hasTwoFactor,
}: {
  membershipId: string;
  profileId: string;
  email: string;
  active: boolean;
  locked: boolean;
  isSelf: boolean;
  hasTwoFactor: boolean;
}) {
  if (isSelf) return <span className="text-xs text-gray-400">you</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {locked && <ActionButton label="Clear lockout" run={() => clearLockoutAction(profileId)} />}
      {active && hasTwoFactor && (
        <ActionButton
          label="Reset two-factor"
          confirmText={`Remove ${email}'s authenticator? They will set up a new one at their next sign-in.`}
          run={() => resetTwoFactorAction(profileId)}
        />
      )}
      {active ? (
        <ActionButton
          label="Deactivate"
          tone="danger"
          confirmText={`Deactivate ${email}? They lose access on their next click.`}
          run={() => setAccountActiveAction(membershipId, false)}
        />
      ) : (
        <ActionButton label="Reactivate" run={() => setAccountActiveAction(membershipId, true)} />
      )}
    </div>
  );
}

export function WithdrawButton({ invitationId }: { invitationId: string }) {
  return <ActionButton label="Withdraw" tone="danger" run={() => withdrawInvitationAction(invitationId)} />;
}

export function ResendWelcomeButton({ registrationId }: { registrationId: string }) {
  return <ActionButton label="Resend welcome" run={() => resendWelcomeAction(registrationId)} />;
}
