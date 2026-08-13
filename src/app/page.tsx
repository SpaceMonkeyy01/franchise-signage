// Placeholder root. There is no product surface here by design: every real
// entry point is scoped — /{brand_slug} for franchisees (Session 2), /admin for
// the team (Session 3), and tokenized or magic links for everyone else
// (SPEC §10). Nobody arrives at the bare origin.

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
        Signage.com team signs in at <code className="rounded bg-gray-100 px-1">/admin</code>, and
        corporate reviewers act from email — no account required.
      </p>
    </main>
  );
}
