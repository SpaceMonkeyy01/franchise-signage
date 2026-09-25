'use client';

import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { completeReset } from './actions';

export function ResetForm({ token, minPassword }: { token: string; minPassword: number }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = await completeReset(token, password, confirm);
      if (failure) setError(failure.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={labelClass}>
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={minPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          required
        />
        <span className="mt-1 block font-normal text-gray-400">At least {minPassword} characters.</span>
      </label>
      <label className={labelClass}>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={fieldClass}
          required
        />
      </label>
      {error && <FormError>{error}</FormError>}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
