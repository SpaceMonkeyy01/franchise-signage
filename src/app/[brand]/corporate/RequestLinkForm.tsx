'use client';

// The "email me a link" form (SPEC §10: corporate dashboard is a magic link).
//
// The success state is deliberately identical for an address on file and one
// that is not — see the action. Which means the copy has to be written for
// someone who might be about to wait for an email that will never arrive, and
// say enough that they work out why themselves.

import { useState, useTransition } from 'react';

import { requestCorporateLinkAction } from './actions';

export function RequestLinkForm({ brandSlug, brandName }: { brandSlug: string; brandName: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestCorporateLinkAction(brandSlug, email);
      if (result.error) return setError(result.error);
      setSent(email.trim());
      setEmail('');
    });
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Check {sent}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          If that address is on file as a {brandName} signage contact, a link is on its way. It
          works for 30 days and needs no password.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Nothing arrived? The dashboard is opened only to the contacts {brandName} nominated at
          setup — your Signage.com manager can add you or forward the current figures.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-4 text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          Try another address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5">
      <label htmlFor="corporate-email" className="text-sm font-semibold text-gray-900">
        Your work email
      </label>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        We send a link rather than asking for a password. There are no accounts in this portal —
        for anyone.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id="corporate-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={`you@${brandSlug}.com`}
          autoComplete="email"
          className="min-w-[15rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
    </form>
  );
}
