'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { signIn } from './actions';
import type { DevAccount } from './dev-hint';
import { PasswordInput } from '@/components/PasswordInput';

export function SignInForm({
  next,
  devAccounts,
}: {
  next: string | null;
  /** Development only: seeded accounts, each a button that fills the form. */
  devAccounts: DevAccount[] | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = await signIn(email, password, next);
      if (failure) setError(failure.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {devAccounts && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          <p>
            <strong>Development sign-in.</strong> Accounts live in the local database. Pick one to
            fill in the form:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Seeded accounts">
            {devAccounts.map((account) => {
              const chosen = email === account.email && password === account.password;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  title={`${account.name} · ${account.email}`}
                  aria-pressed={chosen}
                  className={`rounded-md border px-2.5 py-1 text-left font-medium transition-colors ${
                    chosen
                      ? 'border-amber-500 bg-amber-200/70 text-amber-950'
                      : 'border-amber-300 bg-white/70 text-amber-900 hover:border-amber-400 hover:bg-white'
                  }`}
                >
                  {account.role}
                  <span className="block text-[10px] font-normal text-amber-800/80">{account.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className={labelClass}>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
          required
        />
      </label>

      <label className={labelClass}>
        <span className="flex items-baseline justify-between">
          Password
          <Link href="/forgot-password" className="font-normal text-gray-500 hover:underline">
            Forgot password?
          </Link>
        </span>
        <PasswordInput
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          required
        />
      </label>

      {error && <FormError>{error}</FormError>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
