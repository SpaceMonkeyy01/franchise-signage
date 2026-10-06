// Everyone with access, from one place (DECISIONS #190, #191): the invite form
// on the left; on the right, every account, every recent invitation, and the
// franchisees registered for a welcome email. Team and the queue's
// registrations panel folded in here, so there is one page to manage people.

import Link from 'next/link';

import { requireTeamMember } from '@/lib/auth/team';
import { query } from '@/lib/db/pool';
import { getRegistrations } from '@/lib/db/queries';

import { AccountActions, ResendWelcomeButton, WithdrawButton } from './AccountControls';
import { InviteForm, type Company } from './InviteForm';

export const metadata = { title: 'People · Signage.com' };

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Signage.com admin',
  brand_admin: 'Brand admin',
  brand_reviewer: 'Brand reviewer',
  franchisee_owner: 'Franchisee owner',
  franchisee_staff: 'Store manager',
};

const VIEWS = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'invitations', label: 'Invitations' },
  { key: 'welcome', label: 'Welcome emails' },
] as const;

const GROUPS = [
  { key: 'all', label: 'Everyone', roles: null },
  { key: 'team', label: 'Signage.com', roles: ['platform_admin'] },
  { key: 'brand', label: 'Brand', roles: ['brand_admin', 'brand_reviewer'] },
  { key: 'franchisee', label: 'Franchisee', roles: ['franchisee_owner', 'franchisee_staff'] },
] as const;

interface AccountRow {
  membership_id: string;
  profile_id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  locked: boolean;
  brand: string | null;
  company: string | null;
  stores: string | null;
}

const pill = 'rounded-full px-2 py-0.5 text-xs font-medium';

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; type?: string }>;
}) {
  const me = await requireTeamMember();
  const params = await searchParams;
  const view = VIEWS.find((v) => v.key === params.view)?.key ?? 'accounts';
  const group = GROUPS.find((g) => g.key === params.type) ?? GROUPS[0];

  const [brands, companies, stores, accounts, invitations, registrations] = await Promise.all([
    query<{ id: string; name: string }>(`select id, name from brands order by name`),
    query<{ id: string; brand_id: string; name: string }>(`select id, brand_id, name from franchisees order by name`),
    query<{ id: string; franchisee_id: string; name: string }>(
      `select id, franchisee_id, name from locations where franchisee_id is not null order by name`,
    ),
    query<AccountRow>(
      `select m.id as membership_id, p.id as profile_id, p.email, p.name, m.role::text as role, m.active,
              coalesce(p.locked_until > now(), false) as locked,
              b.name as brand, f.name as company,
              (select string_agg(l.name, ', ' order by l.name)
                 from membership_locations ml join locations l on l.id = ml.location_id
                where ml.membership_id = m.id) as stores
         from memberships m
         join profiles p on p.id = m.profile_id
         left join brands b on b.id = m.brand_id
         left join franchisees f on f.id = m.franchisee_id
        order by m.active desc,
                 array_position(array['platform_admin','brand_admin','brand_reviewer','franchisee_owner','franchisee_staff'], m.role::text),
                 b.name nulls first, lower(p.email)`,
    ),
    query<{
      id: string;
      email: string;
      role: string;
      brand: string | null;
      created_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      expires_at: string;
    }>(
      `select i.id, i.email, i.role::text as role, b.name as brand, i.created_at, i.accepted_at, i.revoked_at, i.expires_at
         from invitations i left join brands b on b.id = i.brand_id
        order by i.created_at desc limit 40`,
    ),
    getRegistrations(),
  ]);

  const byBrand: Record<string, Company[]> = {};
  for (const company of companies) {
    (byBrand[company.brand_id] ??= []).push({
      id: company.id,
      name: company.name,
      stores: stores.filter((store) => store.franchisee_id === company.id).map(({ id, name }) => ({ id, name })),
    });
  }

  const shownAccounts = group.roles
    ? accounts.filter((a) => (group.roles as readonly string[]).includes(a.role))
    : accounts;
  const waiting = invitations.filter(
    (i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) >= new Date(),
  ).length;
  const counts: Record<string, number> = {
    accounts: accounts.filter((a) => a.active).length,
    invitations: waiting,
    welcome: registrations.length,
  };

  return (
    <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">People</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Invite anyone and manage who has access. Deactivating someone takes effect on their next click.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <InviteForm brands={brands} companies={byBrand} />

        <section className="min-w-0">
          <nav className="flex flex-wrap gap-1 border-b border-gray-200">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={v.key === 'accounts' ? '/admin/people' : `/admin/people?view=${v.key}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  view === v.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {v.label}
                <span className="ml-1.5 text-xs text-gray-400">{counts[v.key]}</span>
              </Link>
            ))}
          </nav>

          {view === 'accounts' && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {GROUPS.map((g) => (
                  <Link
                    key={g.key}
                    href={g.key === 'all' ? '/admin/people' : `/admin/people?type=${g.key}`}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      g.key === group.key
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {g.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 font-medium">Account type</th>
                      <th className="px-3 py-2 font-medium">Brand · company</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shownAccounts.map((a) => (
                      <tr key={a.membership_id} data-account={a.email} className={a.active ? '' : 'bg-gray-50 text-gray-500'}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900">{a.name ?? a.email}</p>
                          <p className="text-xs text-gray-500">
                            {a.name ? a.email : null}
                            {!a.active && <span className={`${pill} ml-1 bg-gray-200 text-gray-600`}>deactivated</span>}
                            {a.locked && <span className={`${pill} ml-1 bg-amber-50 text-amber-800`}>locked</span>}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{ROLE_LABEL[a.role] ?? a.role}</td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {a.brand ?? 'Signage.com'}
                          {a.company && <span className="block text-xs text-gray-500">{a.company}</span>}
                          {a.stores && <span className="block text-xs text-gray-500">Stores: {a.stores}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <AccountActions
                            membershipId={a.membership_id}
                            profileId={a.profile_id}
                            email={a.email}
                            active={a.active}
                            locked={a.locked}
                            isSelf={a.profile_id === me.id}
                            hasTwoFactor={a.role === 'platform_admin'}
                          />
                        </td>
                      </tr>
                    ))}
                    {shownAccounts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          No accounts here yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {view === 'invitations' && (
            <>
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Account type</th>
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invitations.map((invite) => {
                      const open = !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at) >= new Date();
                      const status = invite.accepted_at
                        ? { text: 'Accepted', tone: 'bg-emerald-50 text-emerald-800' }
                        : invite.revoked_at
                          ? { text: 'Replaced or withdrawn', tone: 'bg-gray-100 text-gray-500' }
                          : !open
                            ? { text: 'Expired', tone: 'bg-amber-50 text-amber-800' }
                            : { text: 'Waiting', tone: 'bg-sky-50 text-sky-800' };
                      return (
                        <tr key={invite.id} data-invitation={invite.email}>
                          <td className="px-4 py-2 text-gray-900">{invite.email}</td>
                          <td className="px-3 py-2 text-gray-700">{ROLE_LABEL[invite.role] ?? invite.role}</td>
                          <td className="px-3 py-2 text-gray-700">{invite.brand ?? 'Signage.com'}</td>
                          <td className="px-3 py-2">
                            <span className={`${pill} ${status.tone}`}>{status.text}</span>
                            <span className="ml-2 text-xs text-gray-400">
                              {new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{open && <WithdrawButton invitationId={invite.id} />}</td>
                        </tr>
                      );
                    })}
                    {invitations.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                          No invitations yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Inviting the same person to the same role again sends a fresh link and retires the old one.
              </p>
            </>
          )}

          {view === 'welcome' && (
            <>
              <p className="mt-3 text-xs text-gray-500">
                Franchisee owners invited before they have a store. Their welcome email carries the budget number
                and their account invitation.
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Franchisee</th>
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {registrations.map((r) => {
                      const status = r.has_account
                        ? { text: 'Account created', tone: 'bg-emerald-50 text-emerald-800' }
                        : r.welcome_sent_at
                          ? { text: 'Invited', tone: 'bg-sky-50 text-sky-800' }
                          : { text: 'Welcome not sent', tone: 'bg-amber-50 text-amber-800' };
                      return (
                        <tr key={r.id} data-registration={r.email}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900">{r.name ?? r.email}</p>
                            {r.name && <p className="text-xs text-gray-500">{r.email}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{r.brand_name}</td>
                          <td className="px-3 py-2.5">
                            <span className={`${pill} ${status.tone}`}>{status.text}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-end gap-3">
                              <a
                                href={`/${r.brand_slug}/welcome/${r.access_token}`}
                                className="text-xs text-gray-600 underline-offset-2 hover:underline"
                              >
                                Open their page
                              </a>
                              <ResendWelcomeButton registrationId={r.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {registrations.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          Nobody registered yet. Invite a franchisee owner to send the first welcome.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
