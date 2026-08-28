// Who is allowed into /admin (SPEC §10).
//
// Two things happen here, and only one of them is swappable:
//
//   1. Identity — "which email is this?" — comes from Supabase Auth when a
//      project is configured, and from a dev cookie when one is not. Both paths
//      have now run against a real project; the dev provider is still what runs
//      by default here, because Supabase mode disables the smoke suite
//      (docs/STATE.md, DECISIONS #106).
//   2. Authorization — "is that email on the team?" — is a lookup against
//      `team_members`, and is IDENTICAL under both providers. Membership is
//      granted out of band, never self-serve, and is re-checked on every request
//      so that deactivating a row logs someone out rather than waiting for a
//      session to expire.
//
// The dev provider is a stand-in for a login, NOT a login: possession of a
// cookie naming an allowlisted address is enough. It refuses to run in
// production, where a Supabase project is required.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { queryOne } from '../db/pool';

export const DEV_SESSION_COOKIE = 'team_session';

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
}

export type AuthProvider = 'supabase' | 'dev';

/** Which identity provider is in play, and why. */
export function authProvider(): AuthProvider {
  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) return 'supabase';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No Supabase project is configured, so /admin has no way to authenticate anyone. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return 'dev';
}

/**
 * The signed-in team member, or null.
 *
 * Never trust the identity alone: it is checked against the allowlist here, in
 * the one place, so no call site can forget.
 */
export async function getTeamMember(): Promise<TeamMember | null> {
  const email = await currentEmail();
  if (!email) return null;

  return queryOne<TeamMember>(
    `select id, email, name from team_members
      where lower(email) = lower($1) and active`,
    [email],
  );
}

/** Guard for every /admin page. Sends anyone else to the sign-in screen. */
export async function requireTeamMember(): Promise<TeamMember> {
  const member = await getTeamMember();
  if (!member) redirect('/admin/login');
  return member;
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

async function currentEmail(): Promise<string | null> {
  if (authProvider() === 'supabase') return supabaseEmail();
  const store = await cookies();
  return store.get(DEV_SESSION_COOKIE)?.value ?? null;
}

/**
 * The email on the Supabase session.
 *
 * Verified against a real project on 28 Aug 2026: a magic link completed at
 * /auth/callback, this read the session back, and deactivating the caller's
 * `team_members` row locked them out on the very next request. Nine checks, and
 * DECISIONS #107 records what they were.
 *
 * Cookie writes are ignored here because a Server Component cannot perform
 * them; the route handler that completes the link does the writing, and it now
 * exists.
 */
async function supabaseEmail(): Promise<string | null> {
  const { createServerClient } = await import('@supabase/ssr');
  const store = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        // A Server Component cannot set cookies. Refresh happens in the route
        // handler that completes the magic link, so ignoring writes here is
        // correct rather than lossy.
        setAll: () => {},
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
