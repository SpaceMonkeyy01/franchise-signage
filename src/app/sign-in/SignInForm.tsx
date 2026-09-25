'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { signIn } from './actions';

export function SignInForm({ next, devHint }: { next: string | null; devHint: string | null }) {
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
      {devHint && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <strong>Development sign-in.</strong> No Supabase project is configured, so accounts live
          in the local database. {devHint}
        </p>
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
        <input
          type="password"
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
