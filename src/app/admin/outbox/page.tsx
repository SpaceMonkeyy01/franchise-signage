// The outbox — every message the system has sent (or would have).
//
// It lived at /dev until Session 6c, behind an environment flag rather than a
// login, because it began life as the reviewer stand-in and was expected to be
// deleted. Session 4 deleted that half and left the question: does the outbox
// earn its place? It does — "what exactly did we send them, and when" has a
// right answer, and this is the only place holding it — so it moved here, where
// the URL says who it is for and the team allowlist decides.
//
// The flag was never the right guard. This page renders whole emails, and those
// emails carry live credentials: a reviewer's signed approval link, a
// franchisee's status token, an invitation. Anyone who set
// DEV_CONSOLE=1 in production to look at something would have published every
// one of them. An allowlist is what a page like that needs — the same one that
// decides who may approve a package or mark a sign installed.
//
// (`force-dynamic` is inherited from src/app/admin/layout.tsx, which the whole
// segment needs anyway. A prerendered outbox would be a snapshot of build-time
// mail, served forever.)

import Link from 'next/link';

import { requireTeamMember } from '@/lib/auth/team';
import { emailProvider, recentEmails } from '@/lib/email/send';

// Who a message was for, which is how the team looks for one (DECISIONS #191).
const GROUPS: { key: string; label: string; kinds?: string[]; kindPrefix?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'franchisee', label: 'Franchisees', kindPrefix: 'franchisee_' },
  { key: 'review', label: 'Approvals', kinds: ['review_requested', 'review_requested_again', 'package_to_corporate'] },
  { key: 'vendor', label: 'Vendors', kinds: ['vendor_package'] },
  { key: 'accounts', label: 'Accounts', kinds: ['invitation', 'welcome', 'password_reset'] },
  { key: 'catalog', label: 'Catalog', kindPrefix: 'catalog_' },
];

const LIMIT = 50;

export default async function Outbox({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  await requireTeamMember();
  const { type, q } = await searchParams;
  const group = GROUPS.find((g) => g.key === type) ?? GROUPS[0];
  const emails = await recentEmails(LIMIT, { kinds: group.kinds, kindPrefix: group.kindPrefix, search: q });
  const provider = emailProvider();
  const href = (key: string) => {
    const params = new URLSearchParams();
    if (key !== 'all') params.set('type', key);
    if (q) params.set('q', q);
    const query = params.toString();
    return query ? `/admin/outbox?${query}` : '/admin/outbox';
  };

  return (
    <main className="mx-auto w-full page flex-1 px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">Outbox</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
          {provider === 'outbox' ? (
            <>
              No <code>RESEND_API_KEY</code> is configured, so nothing is being delivered — every
              message is rendered and recorded here instead. Open one and use its links exactly as a
              reviewer would.
            </>
          ) : (
            <>
              Mail is being delivered through Resend. This is the record of what went out.
            </>
          )}
        </p>
      </div>

      <h1 className="mt-6 text-xl font-bold text-gray-900">Sent messages</h1>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Link
              key={g.key}
              href={href(g.key)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                g.key === group.key
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/outbox" className="flex gap-2">
          {group.key !== 'all' && <input type="hidden" name="type" value={group.key} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search email or subject"
            aria-label="Search the outbox"
            className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {emails.length === LIMIT ? `The ${LIMIT} most recent.` : `${emails.length} message${emails.length === 1 ? '' : 's'}.`}
      </p>

      <div className="mt-4 space-y-2">
        {emails.map((email) => (
          <Link
            key={email.id}
            href={`/admin/outbox/${email.id}`}
            className="card-lift block rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-300"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{email.subject}</span>
              <span className="text-[11px] text-gray-500">
                {new Date(email.created_at).toLocaleString('en-US')}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              to {email.to_email}
              {email.cc_email && ` · cc ${email.cc_email}`} ·{' '}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {email.kind}
              </span>
              {email.request_code && <span className="ml-1.5 text-gray-700">{email.request_code}</span>}
              {email.error && <span className="ml-1.5 text-rose-600">failed: {email.error}</span>}
            </p>
          </Link>
        ))}

        {emails.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
            {group.key === 'all' && !q ? 'Nothing sent yet.' : 'No messages match.'}
          </p>
        )}
      </div>
    </main>
  );
}
