// Who is allowed into /admin (SPEC v2.3 §10).
//
// Since v2.3 the Signage.com team is a `platform_admin` membership, not a row in
// the `team_members` allowlist, and the console asks three things of a caller
// on every request:
//
//   1. an identity — a password session (./identity.ts);
//   2. an ACTIVE platform_admin membership, read fresh each time, so that
//      deactivating someone locks them out on their next click;
//   3. a passed second factor, within 12 hours of the password (§10.3.3,
//      §10.7 D8). The database repeats the second-factor check itself:
//      app.is_platform_admin() refuses a session whose JWT is not aal2.
//
// The exported names are the ones every /admin page and action already calls,
// so the change of model is invisible to them.

import { redirect } from 'next/navigation';

import {
  getViewer,
  owesSecondFactor,
  platformMembership,
  platformSessionExpired,
  type Viewer,
} from './access';

export { authProvider, type AuthProvider } from './identity';

export interface TeamMember {
  /** The profile id — the Supabase Auth user id. */
  id: string;
  email: string;
  name: string | null;
  membershipId: string;
}

export type TeamAccess =
  | { state: 'ok'; member: TeamMember; viewer: Viewer }
  | { state: 'signed_out' }
  | { state: 'expired' }
  | { state: 'not_member'; viewer: Viewer }
  | { state: 'second_factor'; viewer: Viewer };

export async function teamAccess(): Promise<TeamAccess> {
  const viewer = await getViewer();
  if (!viewer) return { state: 'signed_out' };

  const membership = platformMembership(viewer);
  if (!membership) return { state: 'not_member', viewer };
  if (platformSessionExpired(viewer)) return { state: 'expired' };
  if (owesSecondFactor(viewer)) return { state: 'second_factor', viewer };

  return {
    state: 'ok',
    viewer,
    member: {
      id: viewer.profile.id,
      email: viewer.profile.email,
      name: viewer.profile.name,
      membershipId: membership.id,
    },
  };
}

/** The signed-in team member, or null. */
export async function getTeamMember(): Promise<TeamMember | null> {
  const access = await teamAccess();
  return access.state === 'ok' ? access.member : null;
}

/** Guard for every /admin page. Sends anyone else to where they can fix it. */
export async function requireTeamMember(): Promise<TeamMember> {
  const access = await teamAccess();
  switch (access.state) {
    case 'ok':
      return access.member;
    case 'second_factor':
      redirect('/two-factor?next=/admin');
    case 'expired':
      redirect('/sign-in?next=/admin&reason=expired');
    case 'not_member':
      redirect('/sign-in?next=/admin&reason=not_member');
    default:
      redirect('/sign-in?next=/admin');
  }
}

/**
 * Guard for every /admin server action.
 *
 * Separate from the page guard on purpose: Server Actions are reachable by
 * direct POST, not only through the UI that rendered them, so the check has to
 * happen inside the action rather than around it.
 */
export async function assertTeamMember(): Promise<TeamMember> {
  const member = await getTeamMember();
  if (!member) throw new Error('Not signed in as a Signage.com team member.');
  return member;
}
