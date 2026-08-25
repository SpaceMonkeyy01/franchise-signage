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
// franchisee's status token, a corporate dashboard link. Anyone who set
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

export default async function Outbox() {
  await requireTeamMember();
  const emails = await recentEmails(30);
  const provider = emailProvider();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
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
      <p className="mt-1 text-sm text-gray-500">{emails.length} most recent.</p>

      <div className="mt-4 space-y-2">
        {emails.map((email) => (
          <Link
            key={email.id}
            href={`/admin/outbox/${email.id}`}
            className="block rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-300"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-gray-900">{email.subject}</span>
              <span className="text-[11px] text-gray-400">
                {new Date(email.created_at).toLocaleString('en-US')}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              to {email.to_email}
              {email.cc_email && ` · cc ${email.cc_email}`} ·{' '}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {email.kind}
              </span>
              {email.error && <span className="ml-1.5 text-rose-600">failed: {email.error}</span>}
            </p>
          </Link>
        ))}

        {emails.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
            Nothing sent yet. Prepare a package with pending items at{' '}
            <Link href="/admin" className="underline">
              /admin
            </Link>{' '}
            and the approval email lands here.
          </p>
        )}
      </div>
    </main>
  );
}
