// What a dead dashboard link says (SPEC §9 interface 6).
//
// The reviewer's link page makes the same argument for the same reason: a 404
// tells someone holding a link that they typed it wrong, and they did not. This
// link is a bookmark people keep for a month, so expiry is not an edge case —
// it is the normal end of a link's life, and the page it lands on should read
// like a door with a doorbell rather than a wall.

import Link from 'next/link';

import type { CorporateLinkFailure } from '@/lib/corporate/links';

const COPY: Record<CorporateLinkFailure['reason'], { title: string; body: string }> = {
  expired: {
    title: 'That link has expired',
    body: 'Dashboard links last 30 days. Ask for a fresh one and it arrives in a moment — nothing about your program has changed.',
  },
  revoked: {
    title: 'That link has been switched off',
    body: 'Someone at Signage.com or your brand retired it, usually because the person holding it changed. Ask for a new one below.',
  },
  unknown: {
    title: "We can't open that link",
    body: 'It may have been copied incompletely, or it belongs to a different brand. Ask for a fresh one and it arrives in a moment.',
  },
};

export function LinkTrouble({
  brandSlug,
  failure,
}: {
  brandSlug: string;
  failure: CorporateLinkFailure;
}) {
  const copy = COPY[failure.reason];

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:px-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.body}</p>
        {failure.reason === 'expired' && (
          <p className="mt-2 text-xs text-gray-400">
            {`Expired ${new Date(failure.expiredAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })}.`}
          </p>
        )}
        <Link
          href={`/${brandSlug}/corporate`}
          className="mt-5 inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Email me a new link
        </Link>
      </div>
      {/* Deliberately unbranded: the token is what names a brand, and a dead one
          names nothing. Guessing the brand from the URL would put a franchisor's
          name and colours on a page for someone we cannot identify. */}
      <p className="mt-6 text-center text-xs text-gray-400">
        Signage.com operates this portal on behalf of your brand.
      </p>
    </main>
  );
}
