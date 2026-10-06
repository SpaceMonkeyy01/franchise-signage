// Inviting anyone, from one place (DECISIONS #190): the account type, the
// brand, and for a store manager the franchisee company and its stores. Below,
// every recent invitation across the platform and where it stands.

import { requireTeamMember } from '@/lib/auth/team';
import { query } from '@/lib/db/pool';

import { InviteForm, type Company } from './InviteForm';

export const metadata = { title: 'People · Signage.com' };

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Signage.com admin',
  brand_admin: 'Brand admin',
  brand_reviewer: 'Brand reviewer',
  franchisee_owner: 'Franchisee owner',
  franchisee_staff: 'Store manager',
};

export default async function PeoplePage() {
  await requireTeamMember();
  const [brands, companies, stores, invitations] = await Promise.all([
    query<{ id: string; name: string }>(`select id, name from brands order by name`),
    query<{ id: string; brand_id: string; name: string }>(`select id, brand_id, name from franchisees order by name`),
    query<{ id: string; franchisee_id: string; name: string }>(
      `select id, franchisee_id, name from locations where franchisee_id is not null order by name`,
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
      `select i.id, i.email, i.role, b.name as brand, i.created_at, i.accepted_at, i.revoked_at, i.expires_at
         from invitations i left join brands b on b.id = i.brand_id
        order by i.created_at desc limit 40`,
    ),
  ]);

  const byBrand: Record<string, Company[]> = {};
  for (const company of companies) {
    (byBrand[company.brand_id] ??= []).push({
      id: company.id,
      name: company.name,
      stores: stores.filter((store) => store.franchisee_id === company.id).map(({ id, name }) => ({ id, name })),
    });
  }

  return (
    <main className="mx-auto w-full page-wide flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-gray-900">People</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Invite anyone to Franchise by Signage: choose who they are and which brand they belong to. The invitation link
        is also shown here, to send yourself while email is not set up.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <InviteForm brands={brands} companies={byBrand} />

        <section className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Recent invitations</h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Account type</th>
                  <th className="px-3 py-2 font-medium">Brand</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invitations.map((invite) => {
                  const status = invite.accepted_at
                    ? { text: 'Accepted', tone: 'bg-emerald-50 text-emerald-800' }
                    : invite.revoked_at
                      ? { text: 'Replaced or withdrawn', tone: 'bg-gray-100 text-gray-500' }
                      : new Date(invite.expires_at) < new Date()
                        ? { text: 'Expired', tone: 'bg-amber-50 text-amber-800' }
                        : { text: 'Waiting', tone: 'bg-sky-50 text-sky-800' };
                  return (
                    <tr key={invite.id}>
                      <td className="px-4 py-2 text-gray-900">{invite.email}</td>
                      <td className="px-3 py-2 text-gray-700">{ROLE_LABEL[invite.role] ?? invite.role}</td>
                      <td className="px-3 py-2 text-gray-700">{invite.brand ?? 'Signage.com'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.text}</span>
                        <span className="ml-2 text-xs text-gray-400">
                          {new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {invitations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
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
        </section>
      </div>
    </main>
  );
}
