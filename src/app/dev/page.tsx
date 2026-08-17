// The outbox — every message the system has sent (or would have).
//
// TEMPORARY, and the last thing left at /dev. The reviewer stand-in that used to
// live here is gone: Session 4 replaced it with the real thing, an approval
// email carrying signed single-use links to /review/{token}. With no Resend key
// configured, those emails are recorded rather than delivered — so this page is
// how you read them, and how you click the links a reviewer would click.
//
// Once mail is really being sent, this becomes a support tool rather than a
// stand-in: "what exactly did we send them, and when" is a question with a right
// answer. Keep it if it earns its place; it is guarded either way.

import Link from 'next/link';

import { emailProvider, recentEmails } from '@/lib/email/send';

import { assertDevConsole } from './guard';

export default async function DevOutbox() {
  assertDevConsole();
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
            href={`/dev/mail/${email.id}`}
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
