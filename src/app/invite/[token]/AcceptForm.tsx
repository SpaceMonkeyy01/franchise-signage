'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { FormError, fieldClass, labelClass, primaryButtonClass } from '@/components/AuthCard';

import { acceptWithExistingAccount, acceptWithNewAccount } from './actions';
import { PasswordInput } from '@/components/PasswordInput';

export function AcceptForm({
  token,
  email,
  hasAccount,
  askCompany,
  askSite,
  brandName,
  minPassword,
}: {
  token: string;
  email: string;
  hasAccount: boolean;
  askCompany: boolean;
  /** Franchisee owners: where to go next depends on whether a lease is signed. */
  askSite: boolean;
  brandName: string | null;
  minPassword: number;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hasSite, setHasSite] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (askSite && hasSite === null) {
      setError('Tell us whether your lease is signed, so we know where to take you next.');
      return;
    }
    const site = hasSite ?? false;
    startTransition(async () => {
      const failure = hasAccount
        ? await acceptWithExistingAccount(token, password, site)
        : await acceptWithNewAccount(token, {
            name,
            phone,
            companyName,
            password,
            confirm,
            hasSite: site,
          });
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
            Phone <span className="font-normal text-gray-500">(optional)</span>
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
        <PasswordInput
          autoComplete={hasAccount ? 'current-password' : 'new-password'}
          minLength={hasAccount ? undefined : minPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
          required
        />
        {!hasAccount && (
          <span className="mt-1 block font-normal text-gray-500">At least {minPassword} characters.</span>
        )}
      </label>

      {!hasAccount && (
        <label className={labelClass}>
          Confirm password
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={fieldClass}
            required
          />
        </label>
      )}

      {askSite && (
        <fieldset className="space-y-2">
          <legend className={labelClass}>Have you signed a lease on a site yet?</legend>
          {[
            {
              value: true,
              label: 'Yes — set up my store now',
              hint: `You'll describe the site and confirm the standard ${brandName ?? ''} signage package.`,
            },
            {
              value: false,
              label: 'Not yet',
              hint: 'You’ll see the signage number for your business plan, and set up the store when there is a lease.',
            },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                hasSite === option.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="has-site"
                checked={hasSite === option.value}
                onChange={() => setHasSite(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
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
