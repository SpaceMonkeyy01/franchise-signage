// Signing in to the Signage.com team console (SPEC §9 interface 2).

import { authProvider, getTeamMember } from '@/lib/auth/team';
import { query } from '@/lib/db/pool';
import { redirect } from 'next/navigation';

import { LoginForm } from './LoginForm';

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getTeamMember()) redirect('/admin');

  const { error } = await searchParams;
  const provider = authProvider();
  // Only the dev provider lists addresses: it is a picker, not a directory, and
  // it only exists where there is no real login to use.
  const members =
    provider === 'dev'
      ? await query<{ email: string; name: string | null }>(
          `select email, name from team_members where active order by email`,
        )
      : [];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-bold text-gray-900">Signage.com team</h1>
      <p className="mt-1 text-sm text-gray-500">
        The operator console. Access is granted by adding an address to{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">team_members</code> — there is no
        sign-up.
      </p>

      {error === 'link' && (
        // Sent here by /auth/callback. Magic links are single-use and expire, so
        // the likeliest causes are a second click and an old message — say that,
        // rather than implying something is broken.
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That sign-in link has already been used or has expired. Ask for a new one below.
        </p>
      )}

      <LoginForm provider={provider} members={members} />
    </main>
  );
}
