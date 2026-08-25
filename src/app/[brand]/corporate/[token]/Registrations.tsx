'use client';

// Level 1 of the two-level access model (SPEC §8d), finally in corporate's own
// hands.
//
// This is the same panel the team has on /admin, with one difference that is
// the entire point of §8d: `registered_by` says `corporate`, because the actor
// the spec names is the franchisor at agreement signing, not Signage.com typing
// it for them (DECISIONS #61).
//
// One email address is the whole of the lift, and saving it IS the trigger —
// the welcome email goes at once, so there is no send button here to forget.

import { useState, useTransition } from 'react';

import type { RegistrationWithBrand } from '@/lib/db/queries';

import { registerFranchiseeAction, resendWelcomeAction } from './actions';

export function Registrations({
  brandSlug,
  brandName,
  token,
  registrations,
}: {
  brandSlug: string;
  brandName: string;
  token: string;
  registrations: RegistrationWithBrand[];
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const failure = await registerFranchiseeAction(brandSlug, token, email, name);
      if (failure) return setError(failure.error);
      setEmail('');
      setName('');
    });
  };

  const resend = (registrationId: string) => {
    setError(null);
    startTransition(async () => {
      const failure = await resendWelcomeAction(brandSlug, token, registrationId);
      if (failure) setError(failure.error);
    });
  };

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Franchisee registrations</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Register a franchisee&apos;s email when they sign their agreement — before there is a lease
        or a location. Saving one sends them the {brandName} welcome email straight away, carrying
        their signage budget number and their own link. It is the first thing they see from you.
      </p>

      <form onSubmit={submit} className={`mt-3 flex flex-wrap gap-2 ${pending ? 'opacity-60' : ''}`}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="franchisee@email.com"
          aria-label="Franchisee email"
          className="min-w-[15rem] flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
        />
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name (optional)"
          aria-label="Franchisee name"
          className="w-40 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          {pending ? 'Sending…' : 'Register & welcome'}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {registrations.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-3 text-xs text-gray-500">
          Nobody registered yet. The franchisees you add here are the ones who can get a signage
          number for their lender before they have a site.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-50">
          {registrations.map((registration) => (
            <li key={registration.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-sm text-gray-900">{registration.email}</span>
              {registration.name && (
                <span className="text-xs text-gray-400">{registration.name}</span>
              )}
              <span className="text-xs text-gray-400">
                {new Date(registration.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {registration.welcome_sent_at ? (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                  welcomed
                </span>
              ) : (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                  welcome not sent
                </span>
              )}
              <button
                type="button"
                onClick={() => resend(registration.id)}
                disabled={pending}
                className="ml-auto text-xs text-gray-500 underline-offset-2 transition-colors hover:text-gray-900 hover:underline disabled:opacity-40"
              >
                Resend welcome
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
