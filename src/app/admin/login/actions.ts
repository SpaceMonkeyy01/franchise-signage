'use server';

// Signing in to /admin.
//
// Both paths end the same way: an email that `getTeamMember()` then checks
// against the allowlist. Neither grants anything by itself — being able to sign
// in and being on the team are separate facts (SPEC §10).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { authProvider, DEV_SESSION_COOKIE } from '@/lib/auth/team';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';

/**
 * Dev sign-in: name an allowlisted address and you are it.
 *
 * This is not authentication and does not pretend to be — see
 * src/lib/auth/team.ts. It exists so /admin can be built and driven on a machine
 * with no Supabase project, and it is unreachable in production.
 */
export async function devSignIn(email: string): Promise<SubmitFailure | undefined> {
  if (authProvider() !== 'dev') {
    return { error: 'This build authenticates through Supabase — use the magic link.' };
  }

  const member = await queryOne<{ email: string }>(
    `select email from team_members where lower(email) = lower($1) and active`,
    [email.trim()],
  );
  if (!member) return { error: 'That address is not on the Signage.com team allowlist.' };

  const store = await cookies();
  store.set(DEV_SESSION_COOKIE, member.email, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  redirect('/admin');
}

/**
 * Supabase magic link.
 *
 * UNVERIFIED — no project exists to send one (docs/DECISIONS.md #23). Written so
 * the screen is complete and the swap is a configuration change, not a rewrite.
 */
export async function sendMagicLink(email: string): Promise<SubmitFailure | undefined> {
  if (authProvider() !== 'supabase') {
    return { error: 'No Supabase project is configured in this environment.' };
  }

  // Checked before sending: a link to a non-member is a link that cannot do
  // anything, and saying so up front beats a silent dead end.
  const member = await queryOne<{ email: string }>(
    `select email from team_members where lower(email) = lower($1) and active`,
    [email.trim()],
  );
  if (!member) return { error: 'That address is not on the Signage.com team allowlist.' };

  const { createServerClient } = await import('@supabase/ssr');
  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
      },
    },
  );

  const { error } = await supabase.auth.signInWithOtp({
    email: member.email,
    options: { emailRedirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/admin` },
  });
  if (error) return { error: error.message };
  return undefined;
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_SESSION_COOKIE);
  redirect('/admin/login');
}
