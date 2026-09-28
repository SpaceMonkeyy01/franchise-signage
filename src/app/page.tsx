// The root — the front door.
//
// Everyone but vendors has an account since SPEC v2.3, and nobody signs up:
// accounts come from invitations (§10). What this page does is say, for each
// participant, where their way in is.
//
// Every link on it is an ADDRESS, not a credential, and costs nothing: each one
// asks for sign-in and shows nothing before it. What must never appear here is
// a token. The operator's index of live links is /admin/entry-points, and the
// walkthrough that frames every participant's view is /admin/demo — both behind
// the allowlist, for that reason.

import Link from 'next/link';

// The pilot brand. Hard-coded rather than queried so the page stays static and
// builds with no database, as it always has.
const PILOT = { slug: 'freshbites', name: 'Freshbites' };

const DOORS = [
  {
    who: 'Signage.com team',
    what: 'The operator console: the queue, packages, routing, pricing and fulfilment.',
    how: 'Sign in with your team address.',
    href: '/admin',
    cta: 'Sign in',
  },
  {
    who: `${PILOT.name} franchisee`,
    what: 'Order signage for a location, and follow every request from submission to install.',
    how: 'Sign in with the account your invitation created. A link in an email about a request also opens it.',
    href: `/${PILOT.slug}`,
    cta: `Go to ${PILOT.name} signage`,
  },
  {
    who: `${PILOT.name} corporate`,
    what: 'Your program dashboard: every location, what is installed, what is committed.',
    how: 'Sign in with the account your invitation created. Approvals also work straight from email.',
    href: `/${PILOT.slug}/corporate`,
    cta: 'Sign in to the dashboard',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-widest text-brand">
        Franchise by Signage
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-gray-900">
        Signage workflow for franchise brands.
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">
        Choose who you are. Everyone signs in with the account their invitation created, and
        corporate approvals still work straight from email.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {DOORS.map((door) => (
          <Link
            key={door.href}
            href={door.href}
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400"
          >
            <span className="text-sm font-semibold text-gray-900">{door.who}</span>
            <span className="mt-1 text-xs leading-relaxed text-gray-600">{door.what}</span>
            <span className="mt-2 flex-1 text-xs leading-relaxed text-gray-400">{door.how}</span>
            <span className="mt-4 text-sm font-medium text-brand group-hover:underline">
              {door.cta} →
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        Showing the product?{' '}
        <Link href="/admin/demo" className="font-medium text-gray-900 underline underline-offset-2">
          The walkthrough
        </Link>{' '}
        puts every participant&rsquo;s view of one request side by side. Team sign-in required.
      </p>
    </main>
  );
}
