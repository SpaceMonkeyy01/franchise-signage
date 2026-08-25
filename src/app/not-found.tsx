// Where every `notFound()` in the build lands.
//
// Which, in this product, almost always means one thing: a token that does not
// resolve. Nobody types these URLs — they are pasted from email — so "check the
// address" is useless advice and "this page does not exist" is not what
// happened. What happened is that a credential did not work, and the two
// realistic reasons are worth naming.
//
// Unbranded on purpose: an unresolved token names no brand, and guessing one
// from the URL would put a franchisor's identity on a page for someone we
// cannot identify.

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">That link did not open anything</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Links in our emails are the whole password — so one that was copied incompletely, or that
          belongs to a request that has since been replaced, stops working.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Open the most recent email we sent you and use the link in that one. If there is not one,
          reply to any of them and a person will send a fresh link.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          Signage.com
        </Link>
      </div>
    </main>
  );
}
