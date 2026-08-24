'use client';

// Level 1 of the two-level access model (SPEC §8d), operated by the team.
//
// One email address per new franchisee, typed at agreement signing. That is the
// whole of corporate's lift, and it is the entire trigger: saving the row sends
// the welcome email, so there is no "send" button here to forget to press.
//
// It sits on the queue for the same reason the §8b budget export does — the real
// actor is corporate, whose dashboard is Session 6, and until then the team does
// it on their behalf (DECISIONS #44).

import { useState, useTransition } from 'react';

import type { BrandWithFormats, RegistrationWithBrand } from '@/lib/db/queries';

import { registerFranchiseeAction, resendWelcomeAction } from './actions';

export function Registrations({
  brands,
  registrations,
}: {
  brands: BrandWithFormats[];
  registrations: RegistrationWithBrand[];
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (brands.length === 0) return null;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const failure = await registerFranchiseeAction(brandId, email, name);
      if (failure) return setError(failure.error);
      setEmail('');
      setName('');
    });
  };

  const resend = (registrationId: string) => {
    setError(null);
    startTransition(async () => {
      const failure = await resendWelcomeAction(registrationId);
      if (failure) setError(failure.error);
    });
  };

  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Franchisee registrations</h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Registered at agreement signing, before there is a lease or a location. Saving one sends the
        welcome email — the first thing a franchisee ever sees from us — carrying their budget
        number and their own link.
      </p>

      <div className={`mt-3 flex flex-wrap items-center gap-2 ${pending ? 'opacity-60' : ''}`}>
        <select
          value={brandId}
          onChange={(event) => setBrandId(event.target.value)}
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700"
          aria-label="Brand"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="franchisee@email.com"
          aria-label="Franchisee email"
          className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
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
          type="button"
          onClick={submit}
          disabled={pending || !email.trim()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
        >
          Register &amp; welcome
        </button>
        {pending && <span className="text-xs text-gray-400">working…</span>}
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {registrations.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-50">
          {registrations.map((registration) => (
            <li key={registration.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-sm text-gray-900">{registration.email}</span>
              {registration.name && (
                <span className="text-xs text-gray-400">{registration.name}</span>
              )}
              <span className="text-xs text-gray-400">{registration.brand_name}</span>
              {registration.welcome_sent_at ? (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                  welcomed
                </span>
              ) : (
                // Only reachable when a real provider rejected the message:
                // the outbox never errors, so this means someone has to chase it.
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                  welcome not sent
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {/* The team follows the franchisee's own link when they call to
                    ask what it shows — there is no other view of level 1. */}
                <a
                  href={`/${registration.brand_slug}/welcome/${registration.access_token}`}
                  className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
                >
                  Open their page
                </a>
                <button
                  type="button"
                  onClick={() => resend(registration.id)}
                  disabled={pending}
                  className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
                >
                  Resend welcome
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
