'use client';

// The brand's own people (SPEC v2.3 §10.2): its admins and reviewers.
//
// A brand admin invites and deactivates these two roles here. Franchisee owners
// and store staff are listed per company below them (./Franchisees.tsx).
// Deactivating takes effect on the person's next click, as it does for the
// Signage.com team.

import { useState, useTransition } from 'react';

import {
  inviteBrandMemberAction,
  setBrandMemberActiveAction,
  withdrawBrandInvitationAction,
  type CorporateInviteRole,
} from './actions';

export interface PersonRow {
  membershipId: string;
  email: string;
  name: string | null;
  role: CorporateInviteRole;
  active: boolean;
  isSelf: boolean;
}

export interface InvitedRow {
  id: string;
  email: string;
  role: CorporateInviteRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

const ROLE: Record<CorporateInviteRole, string> = {
  brand_admin: 'Brand admin',
  brand_reviewer: 'Reviewer',
};

export function People({
  brandSlug,
  brandName,
  people,
  invited,
}: {
  brandSlug: string;
  brandName: string;
  people: PersonRow[];
  invited: InvitedRow[];
}) {
  return (
    <div className="mt-5 space-y-6">
      <InviteForm brandSlug={brandSlug} brandName={brandName} />

      <section>
        <h2 className="text-sm font-semibold text-gray-900">People</h2>
        <div className="mt-2 space-y-2">
          {people.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
              Nobody yet.
            </p>
          )}
          {people.map((person) => (
            <div
              key={person.membershipId}
              data-person={person.email}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                person.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{person.name ?? person.email}</p>
                <p className="text-xs text-gray-500">
                  {person.email} · {ROLE[person.role]}
                  {!person.active && ' · deactivated'}
                </p>
              </div>
              {person.isSelf ? (
                <span className="text-xs text-gray-500">you</span>
              ) : (
                <ActiveToggle brandSlug={brandSlug} person={person} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900">Invited</h2>
        <div className="mt-2 space-y-2">
          {invited.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
              No open invitations.
            </p>
          )}
          {invited.map((invitation) => (
            <div
              key={invitation.id}
              data-invited={invitation.email}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                <p className="text-xs text-gray-500">
                  {ROLE[invitation.role]} ·{' '}
                  {invitation.expired
                    ? 'expired — invite them again to send a fresh link'
                    : `sent ${new Date(invitation.createdAt).toLocaleDateString('en-US')}, expires ${new Date(invitation.expiresAt).toLocaleDateString('en-US')}`}
                </p>
              </div>
              <Withdraw brandSlug={brandSlug} invitationId={invitation.id} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function InviteForm({ brandSlug, brandName }: { brandSlug: string; brandName: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CorporateInviteRole>('brand_reviewer');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await inviteBrandMemberAction(brandSlug, email, role);
      if ('error' in result) return setMessage({ ok: false, text: result.error });
      setMessage({
        ok: true,
        text: `Invitation sent to ${result.sentTo}.${result.warning ? ` ${result.warning}` : ''}`,
      });
      setEmail('');
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-gray-900">Invite someone from {brandName}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          aria-label="Email"
          className="min-w-[14rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          required
        />
        <select
          id="invite-role"
          value={role}
          onChange={(event) => setRole(event.target.value as CorporateInviteRole)}
          aria-label="Role"
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="brand_reviewer">Reviewer</option>
          <option value="brand_admin">Brand admin</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          {pending ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Reviewers approve signage and read the program. Brand admins can also register franchisees
        and manage this list. They choose a password when they accept.
      </p>
      {message && (
        <p className={`mt-2 text-xs ${message.ok ? 'text-green-700' : 'text-rose-700'}`}>{message.text}</p>
      )}
    </form>
  );
}

function ActiveToggle({ brandSlug, person }: { brandSlug: string; person: PersonRow }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = () => {
    if (person.active && !window.confirm(`Deactivate ${person.email}? They lose access on their next click.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const failure = await setBrandMemberActiveAction(brandSlug, person.membershipId, !person.active);
      if (failure) setError(failure.error);
    });
  };
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-700">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${
          person.active ? 'text-rose-700' : 'text-gray-600'
        }`}
      >
        {pending ? '…' : person.active ? 'Deactivate' : 'Reactivate'}
      </button>
    </span>
  );
}

function Withdraw({ brandSlug, invitationId }: { brandSlug: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await withdrawBrandInvitationAction(brandSlug, invitationId)))}
      className="text-xs text-rose-700 underline-offset-2 hover:underline disabled:opacity-40"
    >
      {pending ? '…' : 'Withdraw'}
    </button>
  );
}
