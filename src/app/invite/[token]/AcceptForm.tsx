'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { acceptWithExistingAccount, acceptWithNewAccount } from './actions';

export function AcceptForm({
  token,
  email,
  hasAccount,
  askCompany,
  minPassword,
}: {
  token: string;
  email: string;
  hasAccount: boolean;
  askCompany: boolean;
  minPassword: number;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = hasAccount
        ? await acceptWithExistingAccount(token, password)
        : await acceptWithNewAccount(token, { name, phone, companyName, password, confirm });
      if (failure) setError(failure.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={labelClass}>
        Email
        <input value={email} readOnly className={`${fieldClass} bg-gray-50 text-gray-500`} />
      </label>

      {!hasAccount && (
        <>
          <label className={labelClass}>
            Your name
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              required
            />
          </label>
          {askCompany && (
            <label className={labelClass}>
              Company name
              <input
                autoComplete="organization"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="The business that owns your stores"
                className={fieldClass}
                required
              />
            </label>
          )}
          <label className={labelClass}>
            Phone <span className="font-normal text-gray-400">(optional)</span>
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={fieldClass}
            />
          </label>
        </>
      )}

      <label className={labelClass}>
        {hasAccount ? 'Your password' : 'Choose a password'}
        <input
          type="password"
          autoComplete={hasAccount ? 'current-password' : 'new-password'}
          minLength={hasAccount ? undefined : minPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          required
        />
        {!hasAccount && (
          <span className="mt-1 block font-normal text-gray-400">At least {minPassword} characters.</span>
        )}
      </label>

      {!hasAccount && (
        <label className={labelClass}>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={fieldClass}
            required
          />
        </label>
      )}

      {error && <FormError>{error}</FormError>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Working…' : hasAccount ? 'Sign in and accept' : 'Create my account'}
      </button>

      {hasAccount && (
        <p className="text-center text-xs text-gray-500">
          <Link href="/forgot-password" className="hover:underline">
            Forgot your password?
          </Link>
        </p>
      )}
    </form>
  );
}
