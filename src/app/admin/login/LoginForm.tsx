'use client';

import { useState, useTransition } from 'react';

import type { AuthProvider } from '@/lib/auth/team';

import { devSignIn, sendMagicLink } from './actions';

export function LoginForm({
  provider,
  members,
}: {
  provider: AuthProvider;
  members: Array<{ email: string; name: string | null }>;
}) {
  const [email, setEmail] = useState(members[0]?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const failure =
        provider === 'dev' ? await devSignIn(email) : await sendMagicLink(email);
      if (failure) setError(failure.error);
      else if (provider === 'supabase') setSent(true);
    });
  }

  return (
    <div className="mt-6">
      {provider === 'dev' && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <strong>Development sign-in.</strong> No Supabase project is configured, so this trusts
          the address you pick as long as it is on the allowlist. Configure Supabase and the same
          screen sends a magic link instead.
        </p>
      )}

      <label className="block text-xs font-medium text-gray-700">
        Team email
        {members.length > 0 ? (
          <select
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {members.map((member) => (
              <option key={member.email} value={member.email}>
                {member.name ? `${member.name} — ${member.email}` : member.email}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@signage.com"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        )}
      </label>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {sent && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Check your inbox — the link signs you in.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !email.trim()}
        className="mt-4 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? 'Working…' : provider === 'dev' ? 'Sign in' : 'Email me a sign-in link'}
      </button>
    </div>
  );
}
