'use client';

// One franchisee company's store staff, managed by its owner (/staff) or by a
// brand admin from the corporate People tab. The same screen either way; only
// the actions behind it differ, because each checks its own caller.

import { createContext, useContext, useState, useTransition } from 'react';

import type { StaffInvite, StaffMember, StaffStore } from '@/lib/staff';

import {
  inviteFranchiseeStaffAction,
  setFranchiseeStaffActiveAction,
  setFranchiseeStaffStoresAction,
  withdrawFranchiseeStaffInvitationAction,
} from '../corporate/actions';
import {
  inviteStaffAction,
  setStaffActiveAction,
  setStaffStoresAction,
  withdrawStaffInvitationAction,
} from './actions';

export type { StaffInvite, StaffMember };
export type StoreOption = StaffStore;

type Failure = { error: string } | undefined;

interface StaffActions {
  /** Distinguishes form ids when several companies share a page. */
  key: string;
  invite(email: string, locationIds: string[]): Promise<{ sentTo: string; warning: string | null } | { error: string }>;
  setStores(membershipId: string, locationIds: string[]): Promise<Failure>;
  setActive(membershipId: string, active: boolean): Promise<Failure>;
  withdraw(invitationId: string): Promise<Failure>;
}

function actionsFor(brandSlug: string, franchiseeId?: string): StaffActions {
  if (!franchiseeId) {
    return {
      key: 'own',
      invite: (email, ids) => inviteStaffAction(brandSlug, email, ids),
      setStores: (id, ids) => setStaffStoresAction(brandSlug, id, ids),
      setActive: (id, active) => setStaffActiveAction(brandSlug, id, active),
      withdraw: (id) => withdrawStaffInvitationAction(brandSlug, id),
    };
  }
  return {
    key: franchiseeId,
    invite: (email, ids) => inviteFranchiseeStaffAction(brandSlug, franchiseeId, email, ids),
    setStores: (id, ids) => setFranchiseeStaffStoresAction(brandSlug, franchiseeId, id, ids),
    setActive: (id, active) => setFranchiseeStaffActiveAction(brandSlug, franchiseeId, id, active),
    withdraw: (id) => withdrawFranchiseeStaffInvitationAction(brandSlug, franchiseeId, id),
  };
}

const Actions = createContext<StaffActions | null>(null);

function useStaffActions(): StaffActions {
  const actions = useContext(Actions);
  if (!actions) throw new Error('StaffManager actions missing');
  return actions;
}

export function StaffManager({
  brandSlug,
  franchiseeId,
  stores,
  members,
  invitations,
  compact = false,
}: {
  brandSlug: string;
  /** Set when a brand admin manages another company; absent for the owner's own. */
  franchiseeId?: string;
  stores: StoreOption[];
  members: StaffMember[];
  invitations: StaffInvite[];
  /** Tighter spacing and smaller headings, for a card inside the People tab. */
  compact?: boolean;
}) {
  const storeName = (id: string) => stores.find((store) => store.id === id)?.name ?? 'a store';
  const Heading = compact ? 'h4' : 'h2';

  return (
    <Actions.Provider value={actionsFor(brandSlug, franchiseeId)}>
    <div className={compact ? 'mt-3 space-y-4' : 'mt-6 space-y-6'}>
      <InviteForm stores={stores} />

      <section>
        <Heading className="text-sm font-semibold text-gray-900">Staff</Heading>
        <div className="mt-2 space-y-2">
          {members.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
              Nobody yet.
            </p>
          )}
          {members.map((member) => (
            <MemberRow key={member.membershipId} stores={stores} member={member} />
          ))}
        </div>
      </section>

      <section>
        <Heading className="text-sm font-semibold text-gray-900">Invited</Heading>
        <div className="mt-2 space-y-2">
          {invitations.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
              No open invitations.
            </p>
          )}
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              data-invited={invitation.email}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                <p className="text-xs text-gray-500">
                  {invitation.locationIds.map(storeName).join(', ')} ·{' '}
                  {invitation.expired
                    ? 'expired — invite them again to send a fresh link'
                    : `expires ${new Date(invitation.expiresAt).toLocaleDateString('en-US')}`}
                </p>
              </div>
              <Withdraw invitationId={invitation.id} />
            </div>
          ))}
        </div>
      </section>
    </div>
    </Actions.Provider>
  );
}

function StorePicker({
  stores,
  selected,
  onChange,
  name,
}: {
  stores: StoreOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {stores.map((store) => (
        <label key={store.id} className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            name={name}
            checked={selected.includes(store.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, store.id]
                  : selected.filter((id) => id !== store.id),
              )
            }
          />
          {store.name}
        </label>
      ))}
    </div>
  );
}

function InviteForm({ stores }: { stores: StoreOption[] }) {
  const actions = useStaffActions();
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string[]>(stores.length === 1 ? [stores[0].id] : []);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await actions.invite(email, selected);
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
      <p className="text-sm font-medium text-gray-900">Invite a store manager</p>
      <input
        id={actions.key === 'own' ? 'staff-email' : `staff-email-${actions.key}`}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="manager@yourcompany.com"
        aria-label="Email"
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        required
      />
      <p className="mt-3 text-xs font-medium text-gray-700">Stores they can see</p>
      <div className="mt-1.5">
        <StorePicker
          stores={stores}
          selected={selected}
          onChange={setSelected}
          name={`invite-store-${actions.key}`}
        />
      </div>
      <button
        type="submit"
        disabled={pending || selected.length === 0}
        className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--color-brand)' }}
      >
        {pending ? 'Sending…' : 'Send invitation'}
      </button>
      {message && (
        <p className={`mt-2 text-xs ${message.ok ? 'text-green-700' : 'text-rose-700'}`}>{message.text}</p>
      )}
    </form>
  );
}

function MemberRow({ stores, member }: { stores: StoreOption[]; member: StaffMember }) {
  const actions = useStaffActions();
  const [selected, setSelected] = useState<string[]>(member.locationIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed =
    selected.length !== member.locationIds.length ||
    selected.some((id) => !member.locationIds.includes(id));

  const act = (fn: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const failure = await fn();
      if (failure) setError(failure.error);
    });
  };

  return (
    <div
      data-staff={member.email}
      className={`rounded-xl border px-4 py-3 ${
        member.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'
      } ${pending ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{member.name ?? member.email}</p>
          <p className="text-xs text-gray-500">
            {member.email}
            {!member.active && ' · deactivated'}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              member.active &&
              !window.confirm(`Deactivate ${member.email}? They lose access on their next click.`)
            ) {
              return;
            }
            act(() => actions.setActive(member.membershipId, !member.active));
          }}
          className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${
            member.active ? 'text-rose-700' : 'text-gray-600'
          }`}
        >
          {member.active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
      {member.active && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StorePicker
            stores={stores}
            selected={selected}
            onChange={setSelected}
            name={`stores-${member.membershipId}`}
          />
          {changed && (
            <button
              type="button"
              disabled={pending || selected.length === 0}
              onClick={() => act(() => actions.setStores(member.membershipId, selected))}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-gray-400 disabled:opacity-40"
            >
              Save stores
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function Withdraw({ invitationId }: { invitationId: string }) {
  const actions = useStaffActions();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await actions.withdraw(invitationId)))}
      className="text-xs text-rose-700 underline-offset-2 hover:underline disabled:opacity-40"
    >
      {pending ? '…' : 'Withdraw'}
    </button>
  );
}
