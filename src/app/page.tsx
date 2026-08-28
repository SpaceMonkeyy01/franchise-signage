// The root. There is no product surface here by design: every real entry point
// is scoped — /{brand_slug} for franchisees (Session 2), /admin for the team
// (Session 3), and tokenized or magic links for everyone else (SPEC §10).
// Nobody arrives at the bare origin in the ordinary run of things.
//
// It does now carry two links, which it did not before a hosted deployment
// existed. They are ADDRESSES, not credentials — the same two sentences this
// page always said, made clickable — and they cost nothing: /admin refuses
// anyone not on the allowlist, and a brand's home page is where a franchisee is
// meant to start. What must never appear here is a token. The operator's index
// of live links is /admin/entry-points, behind the allowlist, for that reason.

import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-3 px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Franchise by Signage
      </p>
      <h1 className="text-2xl font-semibold text-gray-900">
        Signage workflow for franchise brands.
      </h1>
      <p className="text-sm leading-relaxed text-gray-600">
        Entry points are scoped per brand. Franchisees arrive on a co-branded link, the
        Signage.com team signs in at{' '}
        <Link href="/admin" className="font-medium text-gray-900 underline underline-offset-2">
          /admin
        </Link>
        , and corporate reviewers act from email — no account required.
      </p>
      <p className="text-sm leading-relaxed text-gray-600">
        The pilot brand is{' '}
        <Link href="/freshbites" className="font-medium text-gray-900 underline underline-offset-2">
          Freshbites
        </Link>
        .
      </p>
    </main>
  );
}
