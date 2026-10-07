// The approvals view, on the web (SPEC v2.3 §10.3.4, phase C).
//
// Until phase C this tab showed everything and decided nothing: it opened from a
// 30-day multi-use link, and letting that bookmark approve would have replaced
// the reviewer's signed, single-use credential with a weaker one (DECISIONS
// #75). Behind sign-in the credential is the person, so the tab decides — with
// the same cards the approval email's page renders (src/components/ReviewPanel)
// and through the same decision code, so a sign approved here reads exactly as
// one approved from the inbox, bar the route recorded against it.
//
// The emailed buttons stay: approving straight from the inbox is the fastest
// path, and an item decided here makes the email's button say so.

import { ReviewPanel } from '@/components/ReviewPanel';
import type { RequestDetail } from '@/lib/db/queries';

import { decideItemAction, requestChangesAction } from './actions';
import { ResendApproval } from './ResendApproval';
import { storeName } from '@/lib/format';

export function Approvals({
  brandSlug,
  requests,
}: {
  brandSlug: string;
  requests: RequestDetail[];
}) {
  if (requests.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-gray-900">Nothing is waiting on you</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">
          Standard package items and like-for-like replacements approve themselves under your brand
          rules. Add-ons and flagged exceptions appear here — and in your reviewers&apos; inboxes —
          as franchisees submit them.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {requests.map((request) => (
        <RequestBlock key={request.id} brandSlug={brandSlug} request={request} />
      ))}
    </div>
  );
}

function RequestBlock({ brandSlug, request }: { brandSlug: string; request: RequestDetail }) {
  const pending = request.items.filter((item) => item.item_status === 'pending_review');
  // Said first here as it is in the email: the program's argument is that most
  // signage never reaches corporate at all, and the count is the evidence.
  const proceeding = request.items.filter(
    (item) => item.item_status === 'auto_approved' || item.item_status === 'approved',
  );

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4"
      data-request-code={request.code}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{storeName(request.location.name, request.brand.name)}</p>
          <p className="text-xs text-gray-500">
            {request.code}
            {request.submitted_at && (
              <>
                {' · submitted '}
                {new Date(request.submitted_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </>
            )}
            {request.package_version > 1 && ` · resubmitted (v${request.package_version})`}
          </p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {pending.length} awaiting you
        </span>
      </div>

      {proceeding.length > 0 && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-xs text-gray-700"
          style={{ background: 'var(--color-brand-light)' }}
        >
          {proceeding.length} item{proceeding.length === 1 ? '' : 's'} on this request{' '}
          {proceeding.length === 1 ? 'is' : 'are'} proceeding without you — standard package items
          and like-for-like replacements under your brand rules.
        </p>
      )}

      <ReviewPanel
        request={request}
        decide={decideItemAction.bind(null, brandSlug, request.id)}
        sendBack={requestChangesAction.bind(null, brandSlug, request.id)}
        showProceeding={false}
        showSettled={false}
      />

      <ResendApproval brandSlug={brandSlug} requestId={request.id} />
    </section>
  );
}
