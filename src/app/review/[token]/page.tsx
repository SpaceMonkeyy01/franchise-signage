// Where an approval link lands (SPEC §9 interface 3).
//
// Minimal and public: no login, no account, no navigation into the rest of the
// portal. A reviewer arrives from their inbox, decides, and leaves. Everything
// they need to decide is on this one page, because a franchisor who has to go
// looking for context is a franchisor who does not answer for a week.

import { notFound } from 'next/navigation';

import { BrandTheme } from '@/components/BrandChrome';
import { getRequestById } from '@/lib/db/queries';
import { resolveReviewLink, type LinkFailure } from '@/lib/review/links';

import { ReviewPanel } from './ReviewPanel';

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ item?: string; action?: string }>;
}) {
  const { token } = await params;
  const { item, action } = await searchParams;

  const resolved = await resolveReviewLink(token);
  if (!resolved.ok) return <LinkProblem failure={resolved.failure} />;

  const request = await getRequestById(resolved.link.requestId);
  if (!request) notFound();

  return (
    <>
      <BrandTheme brand={request.brand} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-wider text-gray-400">
          {request.brand.name} · signage approval
        </p>
        <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
          {request.location.name}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {request.code}
          {request.package_version > 1 && ` · package v${request.package_version}, resubmitted`} ·
          reviewing as {resolved.link.reviewerEmail}
        </p>

        <ReviewPanel
          token={token}
          request={request}
          focusItemId={item ?? null}
          focusAction={action === 'changes' || action === 'decline' ? action : 'approve'}
        />
      </main>
    </>
  );
}

/**
 * Why a link did not work.
 *
 * Named rather than 404'd: "this was replaced when the franchisee edited the
 * request" and "you already finished this" are things a reviewer needs to hear,
 * and neither is an error on their part.
 */
function LinkProblem({ failure }: { failure: LinkFailure }) {
  const MESSAGES: Record<LinkFailure['reason'], { title: string; body: string }> = {
    unknown: {
      title: 'That link is not one we issued',
      body: 'Check that the whole address was copied from the email, or ask the Signage.com team to resend it.',
    },
    expired: {
      title: 'That link has expired',
      body: 'Approval links last seven days. Ask the Signage.com team for a fresh one and the request will be exactly where you left it.',
    },
    revoked: {
      title: 'That link was replaced',
      body: 'The request changed after this email was sent — usually because the franchisee answered a change request. A newer email has the current version.',
    },
    used: {
      title: 'This review is complete',
      body: 'Every item on this request has been decided. Nothing here is waiting on you.',
    },
  };

  const message = MESSAGES[failure.reason];

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-20">
      <h1 className="text-lg font-semibold text-gray-900">{message.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{message.body}</p>
      <p className="mt-6 text-xs text-gray-400">
        Nothing was changed by opening this page.
      </p>
    </main>
  );
}
