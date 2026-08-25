'use client';

// What a franchisee sees when something we did not anticipate goes wrong.
//
// Everyone in this product arrives from a link in an email and has no account,
// no support portal and no way to retry other than the page in front of them.
// So this says three things and nothing else: it is ours not theirs, their link
// still works, and here is the button that tries again. A stack trace, an error
// code, or an apology paragraph would all be worse.
//
// It deliberately carries no brand chrome. An error can be thrown before the
// brand is resolved, and putting a franchisor's name and colour on a broken page
// we cannot attribute to them is not co-branding — it is blaming them for our
// bug.

import { useEffect } from 'react';

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The server log is where this is actually diagnosed; the digest is what
    // ties a support call to a line in it.
    console.error('unhandled error', error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Something went wrong at our end</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Nothing you were doing has been lost, and your link still works. Try again — if it keeps
          happening, reply to any email from us and a person will pick it up.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Try again
        </button>
        {error.digest && (
          // Only useful to us, so it is small and unexplained rather than
          // dressed up as something the reader should act on.
          <p className="mt-4 text-[10px] text-gray-300">ref {error.digest}</p>
        )}
      </div>
    </main>
  );
}
