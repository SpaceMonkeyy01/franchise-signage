'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { issueCorporateLinkAction, type IssuedLink } from './actions';

export function CorporateLinkPanel({
  brandSlug,
  brandName,
}: {
  brandSlug: string;
  brandName: string;
}) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setLink(null);
    startTransition(async () => {
      const result = await issueCorporateLinkAction(brandSlug, email);
      if ('error' in result) setError(result.error);
      else setLink(result.link);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-gray-900">{brandName}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && email.trim()) submit();
          }}
          placeholder="a contact configured on this brand"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !email.trim()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Issuing…' : 'Issue link'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      {link && (
        <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">
            {link.email} · {link.role.replace(/_/g, ' ')} · expires{' '}
            {new Date(link.expiresAt).toLocaleDateString()}
          </p>
          {/* Rendered as a link rather than a copy button: the common case is
              opening it here to see what they see. It is a normal URL, so
              copying it is whatever the browser already does. */}
          <Link
            href={link.url}
            className="mt-1 block break-all text-sm font-medium text-gray-900 underline underline-offset-2"
          >
            {link.url}
          </Link>
        </div>
      )}
    </div>
  );
}
