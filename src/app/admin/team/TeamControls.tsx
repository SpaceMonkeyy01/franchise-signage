'use client';

import { useState, useTransition } from 'react';

import {
  clearTeamMemberLockout,
  inviteTeamMember,
  resetTeamMemberTwoFactor,
  setTeamMemberActive,
  withdrawInvitation,
} from './actions';

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await inviteTeamMember(email);
      if ('error' in result) setMessage({ ok: false, text: result.error });
      else {
        setMessage({ ok: true, text: `Invitation sent to ${result.sentTo}.` });
        setEmail('');
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <label className="block text-sm font-medium text-gray-900">
        Invite a Signage.com admin
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@signage.com"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-normal"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {pending ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
      </label>
      <p className="mt-2 text-xs text-gray-500">
        They choose a password and set up two-factor when they accept. Admins can reach every brand.
      </p>
      {message && (
        <p className={`mt-2 text-xs ${message.ok ? 'text-green-700' : 'text-rose-700'}`}>{message.text}</p>
      )}
    </form>
  );
}

function ActionButton({
  label,
  confirmText,
  run,
  tone = 'default',
}: {
  label: string;
  confirmText?: string;
  run: () => Promise<void>;
  tone?: 'default' | 'danger';
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        startTransition(run);
      }}
      className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${
        tone === 'danger' ? 'text-rose-700' : 'text-gray-600'
      }`}
    >
      {pending ? '…' : label}
    </button>
  );
}

export function MemberActions({
  membershipId,
  profileId,
  email,
  active,
  locked,
  isSelf,
}: {
  membershipId: string;
  profileId: string;
  email: string;
  active: boolean;
  locked: boolean;
  isSelf: boolean;
}) {
  if (isSelf) return <span className="text-xs text-gray-500">you</span>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {locked && <ActionButton label="Clear lockout" run={() => clearTeamMemberLockout(profileId)} />}
      {active && (
        <ActionButton
          label="Reset two-factor"
          confirmText={`Remove ${email}'s authenticator? They will set up a new one at their next sign-in.`}
          run={() => resetTeamMemberTwoFactor(profileId)}
        />
      )}
      {active ? (
        <ActionButton
          label="Deactivate"
          tone="danger"
          confirmText={`Deactivate ${email}? They lose access on their next click.`}
          run={() => setTeamMemberActive(membershipId, false)}
        />
      ) : (
        <ActionButton label="Reactivate" run={() => setTeamMemberActive(membershipId, true)} />
      )}
    </div>
  );
}

export function WithdrawButton({ invitationId }: { invitationId: string }) {
  return <ActionButton label="Withdraw" tone="danger" run={() => withdrawInvitation(invitationId)} />;
}
