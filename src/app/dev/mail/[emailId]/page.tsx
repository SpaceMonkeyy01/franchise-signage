// One message, rendered as its recipient would see it.
//
// The HTML is shown in an iframe with `srcDoc` rather than injected into this
// page: it is stored markup, and rendering it inline would let a template's
// styles leak into the app — and, more to the point, would be a habit worth not
// forming around content that will one day include franchisee-supplied text.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEmail } from '@/lib/email/send';

import { assertDevConsole } from '../../guard';

export default async function DevMailItem({
  params,
}: {
  params: Promise<{ emailId: string }>;
}) {
  assertDevConsole();
  const { emailId } = await params;
  const email = await getEmail(emailId);
  if (!email) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/dev" className="text-sm text-gray-500 underline-offset-2 hover:underline">
        ← Outbox
      </Link>

      <h1 className="mt-4 text-lg font-bold text-gray-900">{email.subject}</h1>
      <p className="mt-1 text-xs text-gray-500">
        to {email.to_email}
        {email.cc_email && ` · cc ${email.cc_email}`} · {email.kind} · {email.provider} ·{' '}
        {new Date(email.created_at).toLocaleString('en-US')}
      </p>
      {email.error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Delivery failed: {email.error}
        </p>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Links inside open in this tab — clicking Approve here is exactly what a reviewer clicking it
        in their inbox does.
      </p>

      <iframe
        title="Email preview"
        srcDoc={email.html}
        className="mt-2 h-[70vh] w-full rounded-xl border border-gray-200 bg-white"
      />
    </main>
  );
}
