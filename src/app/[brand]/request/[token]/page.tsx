// The status page (SPEC §9 interface 1).
//
// One link, reachable forever, that answers the only question a franchisee has
// after submitting: where is my signage. Per-item status and price, the quote,
// production progress, and the full timeline — no login, no account, no
// chasing anyone by email.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, ItemStatusChip, RequestStatusChip, VendorChip } from '@/components/StatusChip';
import { getRequestByToken, type LineItemRow, type RequestDetail } from '@/lib/db/queries';
import type { RequestStatus } from '@/lib/status/types';
import { fileUrl } from '@/lib/storage';

import { acceptQuote } from './actions';
import { ResubmitPanel } from './ResubmitPanel';

const FILE_KIND_LABEL: Record<string, string> = {
  placement_photo: 'Placement photo',
  condition_photo: 'Condition photo',
  mockup: 'Mockup',
  site_file: 'Site file',
  landlord_criteria: 'Lease sign exhibit',
  package_pdf: 'Package',
};

const ORIGIN_LABEL: Record<string, string> = {
  standard: 'Standard package',
  addon: 'Add-on',
  exception: 'Exception',
  replacement: 'Like-for-like replacement',
};

// The internal tail's visible progress (SPEC §4). The external tail has no
// production stages to show — the vendor works off-platform.
const PRODUCTION_STAGES: RequestStatus[] = ['accepted', 'in_production', 'shipped', 'completed'];
const STAGE_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  in_production: 'In production',
  shipped: 'Shipped',
  completed: 'Installed',
};

export default async function RequestStatusPage({
  params,
}: {
  params: Promise<{ brand: string; token: string }>;
}) {
  const { brand: slug, token } = await params;
  const request = await getRequestByToken(token);
  if (!request || request.brand.slug !== slug) notFound();

  const quote = request.quotes[0] ?? null;
  const changed = new Set(request.change_request?.line_item_ids ?? []);
  // The editable set is the items that actually reopened, not the ids the
  // change request named: a reviewer can flag an item and the franchisee can
  // have answered it already.
  const reopened = request.items.filter((item) => item.item_status === 'changes_requested');

  return (
    <>
      <BrandTheme brand={request.brand} />
      <BrandHeader brand={request.brand} backHref={`/${slug}`} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{request.code}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {request.location.name}
              {request.package_version > 1 && ` · package v${request.package_version}`}
            </p>
          </div>
          <RequestStatusChip status={request.status} />
        </div>

        {request.change_request && (
          <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <h2 className="text-sm font-semibold text-rose-900">
              Corporate asked for changes on {request.change_request.line_item_ids.length} item(s)
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-rose-800">
              {request.change_request.comment}
            </p>
            <p className="mt-2 text-xs text-rose-700">
              Update the flagged items below and resubmit. Everything already approved keeps its
              approval — nothing else is affected.
            </p>
          </section>
        )}

        {/* §8b: the documents come with the quote, but the franchisee told us a
            lender is involved at submission — so acknowledge it from the start
            rather than only once there is something to attach. */}
        {request.financing_involved && !quote && (
          <p className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900/80">
            You told us a lender is funding this location. Once the quote lands, the budgetary
            quote, formal invoice and paid receipt your lender asks for are generated from it — you
            will not have to ask us for them.
          </p>
        )}

        {request.change_request && reopened.length > 0 && (
          <ResubmitPanel
            token={token}
            brandSlug={slug}
            items={reopened}
            comment={request.change_request.comment}
          />
        )}

        <section className="mt-5 space-y-3">
          {request.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              brand={request.brand}
              flagged={changed.has(item.id)}
            />
          ))}
        </section>

        {request.files.length > 0 && (
          <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Documents you sent</h2>
            <ul className="mt-2 space-y-1">
              {request.files.map((file) => (
                <li key={file.id} className="text-xs text-gray-600">
                  <a
                    href={fileUrl(file.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {FILE_KIND_LABEL[file.kind] ?? 'File'}: {file.file_name ?? 'view'}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* One card per package. Routing (SPEC §4) can split a request between
            Signage.com and the brand's vendor, and showing only the first left
            the franchisee reading one half of their own number — which the §8b
            PDF, which totals every package, would then contradict. */}
        {request.quotes.map((packageQuote) => (
          <QuoteCard
            key={packageQuote.id}
            request={request}
            quote={packageQuote}
            token={token}
            split={request.quotes.length > 1}
          />
        ))}

        {request.quotes.some((q) => q.priced_count > 0) && (
          <LenderDocuments request={request} token={token} />
        )}

        {PRODUCTION_STAGES.includes(request.status) && quote && !quote.external && (
          <ProductionProgress status={request.status} />
        )}

        <Timeline request={request} />
      </main>
    </>
  );
}

function ItemCard({
  item,
  brand,
  flagged,
}: {
  item: LineItemRow;
  brand: RequestDetail['brand'];
  flagged: boolean;
}) {
  const policy = item.vendor_policy_override ?? brand.vendor_policy;

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        flagged ? 'border-rose-300 ring-1 ring-rose-200' : 'border-gray-200'
      }`}
    >
      <div className="flex gap-3">
        <SignThumbnail
          renderKey={item.render_key}
          label={item.brand_item_name}
          className="h-12 w-16 shrink-0 rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{item.brand_item_name}</h3>
            <ItemStatusChip status={item.item_status} />
          </div>

          {item.spec_summary && (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.spec_summary}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {ORIGIN_LABEL[item.origin] ?? item.origin}
            </span>
            {item.sizing && <span>{item.sizing}</span>}
            <span className="font-medium text-gray-900">{formatPrice(item.est_price_snapshot)}</span>
            <VendorChip policy={policy} vendorName={brand.vendor_name} brandPolicy={brand.vendor_policy} />
          </div>

          {item.site_notes && (
            <p className="mt-2 text-[11px] leading-relaxed text-gray-600">{item.site_notes}</p>
          )}

          {item.tbd_fields.length > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              TBD: {item.tbd_fields.join(', ')} — the Signage.com team will follow up. This never
              held up your submission.
            </p>
          )}

          {item.exception_issue && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Exception: {item.exception_issue}
            </p>
          )}

          {item.review_note && (
            <p className="mt-2 rounded bg-green-50 px-2 py-1 text-[11px] text-green-800">
              Corporate: {item.review_note}
            </p>
          )}

          {item.files.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2">
              {item.files.map((file) => (
                <a
                  key={file.id}
                  href={fileUrl(file.storage_path)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-600 underline-offset-2 hover:underline"
                >
                  {FILE_KIND_LABEL[file.kind] ?? 'File'}: {file.file_name ?? 'view'}
                </a>
              ))}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function QuoteCard({
  request,
  quote,
  token,
  split,
}: {
  request: RequestDetail;
  quote: NonNullable<RequestDetail['quotes'][number]>;
  token: string;
  /** True when this is one of several packages, so the card says whose it is. */
  split: boolean;
}) {
  const accepted = quote.accepted_at !== null;
  // A request with ANY external package runs the external tail end to end —
  // which is what the team console already assumes, and the two surfaces have to
  // agree. SPEC §6 offers the tails as alternatives and says nothing about a
  // request that is both, so the franchisee is told who they order with rather
  // than shown a button whose meaning nobody has decided (DECISIONS #51).
  const mixed = request.quotes.some((q) => q.external);
  const acceptable =
    !mixed && !quote.external && !accepted && request.status === 'quote_ready';

  return (
    <section className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-indigo-950">
            {split ? `Quote — ${quote.recipient_name ?? 'Signage.com'}` : 'Quote'}
          </h2>
          <p className="mt-0.5 text-xs text-indigo-900/70">
            {quote.external
              ? `Quoted by ${request.brand.vendor_name ?? 'your brand’s vendor'} — ordering happens with them directly.`
              : `Fulfilled by Signage.com${quote.tat ? ` · ${quote.tat}` : ''}`}
          </p>
        </div>
        <p className="text-xl font-bold text-indigo-950">{formatPrice(quote.priced_total)}</p>
      </div>

      <p className="mt-2 text-xs text-indigo-900/80">
        {quote.priced_count} priced item(s)
        {quote.manual_count > 0 && ` · ${quote.manual_count} custom item(s) quoted separately`}
      </p>

      {acceptable && (
        <form
          action={async () => {
            'use server';
            await acceptQuote(token, quote.id);
          }}
          className="mt-3"
        >
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)' }}
          >
            Accept quote and start production
          </button>
        </form>
      )}

      {accepted && (
        <p className="mt-3 text-xs font-medium text-emerald-800">
          Accepted {new Date(quote.accepted_at!).toLocaleDateString('en-US')} — in the production
          queue.
        </p>
      )}

      {/* Otherwise this package would sit there priced, with no button and no
          explanation of what happens to it. */}
      {mixed && !quote.external && !accepted && request.status === 'quote_ready' && (
        <p className="mt-3 text-xs text-indigo-900/70">
          This half of your signage is fulfilled by Signage.com. Because the rest is going to{' '}
          {request.brand.vendor_name ?? 'your brand’s vendor'}, your Signage.com contact confirms
          both with you together — there is nothing to click here.
        </p>
      )}

    </section>
  );
}

/**
 * The §8b document set, as its own block rather than part of a quote card.
 *
 * The budgetary quote covers the whole request — every package, one total — so
 * it cannot belong to any one card on a split request. It is offered to
 * everyone, not only to franchisees who ticked the financing box: that answer
 * was captured at submission and lenders turn up later, so the flag changes the
 * wording here, never the availability.
 */
function LenderDocuments({ request, token }: { request: RequestDetail; token: string }) {
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/api/documents/quote/${token}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          Budgetary quote (PDF)
        </a>
        {/* Issued by the team (SPEC §8b is explicit that both are
            team-triggered), downloaded by the person who actually hands them to
            a lender. Nothing appears here until the team has issued it. */}
        {request.quotes
          .filter((q) => q.invoice_number)
          .map((q) => (
            <span key={q.id} className="contents">
              <a
                href={`/api/documents/invoice/${token}/${q.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50"
              >
                Invoice {q.invoice_number} (PDF)
              </a>
              {q.paid_at && (
                <a
                  href={`/api/documents/invoice/${token}/${q.id}?kind=receipt`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-50"
                >
                  Paid receipt (PDF)
                </a>
              )}
            </span>
          ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        {request.financing_involved
          ? 'You told us a lender is funding this location — this is the document they ask for during underwriting. The formal invoice follows when you accept, and the paid receipt after payment.'
          : 'On Signage.com letterhead, with line items and totals — the format a lender or landlord asks for.'}
      </p>
    </section>
  );
}

function ProductionProgress({ status }: { status: RequestStatus }) {
  const current = PRODUCTION_STAGES.indexOf(status);
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Production</h2>
      <ol className="mt-3 flex gap-1">
        {PRODUCTION_STAGES.map((stage, i) => (
          <li key={stage} className="flex-1">
            <div
              className="h-1.5 rounded-full"
              style={{ background: i <= current ? 'var(--color-brand)' : '#e5e7eb' }}
            />
            <p
              className={`mt-1.5 text-[10px] ${
                i <= current ? 'font-medium text-gray-900' : 'text-gray-400'
              }`}
            >
              {STAGE_LABEL[stage]}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ACTOR_LABEL: Record<string, string> = {
  franchisee: 'You',
  team: 'Signage.com team',
  reviewer: 'Corporate',
  corporate: 'Corporate',
  system: 'System',
};

function Timeline({ request }: { request: RequestDetail }) {
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">History</h2>
      <ol className="mt-3 space-y-3">
        {request.events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
            <div className="min-w-0">
              <p className="text-sm leading-snug text-gray-800">{event.summary}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {ACTOR_LABEL[event.actor] ?? event.actor} ·{' '}
                {new Date(event.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        Keep this link — it stays live for the whole project.{' '}
        <Link href={`/${request.brand.slug}`} className="underline">
          All your locations
        </Link>
      </p>
    </section>
  );
}
