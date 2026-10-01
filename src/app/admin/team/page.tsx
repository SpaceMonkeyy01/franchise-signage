// The Signage.com team (SPEC v2.3 §10.2, phase A of §9b).
//
// Who holds platform_admin, who has been invited, and the four things an admin
// does for a colleague: invite, deactivate or reactivate, reset a lost
// authenticator, clear a lockout. Brand and franchisee people are managed by
// their own admins (phases B–C), not here.

import { requireTeamMember } from '@/lib/auth/team';
import { pendingInvitations } from '@/lib/auth/invitations';
import { query } from '@/lib/db/pool';

import { InviteForm, MemberActions, WithdrawButton } from './TeamControls';

interface TeamRow {
  membership_id: string;
  profile_id: string;
  email: string;
  name: string | null;
  active: boolean;
  locked: boolean;
  created_at: string;
}

export default async function TeamPage() {
  const me = await requireTeamMember();

  const [members, invitations] = await Promise.all([
    query<TeamRow>(
      `select m.id as membership_id, p.id as profile_id, p.email, p.name, m.active,
              coalesce(p.locked_until > now(), false) as locked, m.created_at
         from memberships m join profiles p on p.id = m.profile_id
        where m.role = 'platform_admin'
        order by m.active desc, p.email`,
    ),
    pendingInvitations(null),
  ]);

  return (
    <main className="mx-auto w-full page flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">Team</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
        Signage.com admins reach every brand. Each signs in with a password and a code from their
        phone, and deactivating someone takes effect on their next click.
      </p>

      <div className="mt-6">
        <InviteForm />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-gray-900">Admins</h2>
      <div className="mt-3 space-y-2">
        {members.map((row) => (
          <div
            key={row.membership_id}
            className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
              row.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{row.name ?? row.email}</p>
              <p className="text-xs text-gray-500">
                {row.email}
                {!row.active && ' · deactivated'}
                {row.locked && ' · locked after failed sign-ins'}
              </p>
            </div>
            <MemberActions
              membershipId={row.membership_id}
              profileId={row.profile_id}
              email={row.email}
              active={row.active}
              locked={row.locked}
              isSelf={row.profile_id === me.id}
            />
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-gray-900">Invited</h2>
      <div className="mt-3 space-y-2">
        {invitations.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
            No open invitations.
          </p>
        )}
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
              <p className="text-xs text-gray-500">
                {invitation.expired
                  ? 'Expired — invite them again to send a fresh link'
                  : `Sent ${new Date(invitation.createdAt).toLocaleDateString('en-US')} · expires ${new Date(invitation.expiresAt).toLocaleDateString('en-US')}`}
              </p>
            </div>
            <WithdrawButton invitationId={invitation.id} />
          </div>
        ))}
      </div>
    </main>
  );
}
