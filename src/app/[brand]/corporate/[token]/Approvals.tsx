// The approvals view, on the web (SPEC §9 interface 6).
//
// The demo's corporate persona has a second tab that IS the reviewer's screen,
// buttons and all, because in a demo one person is playing everybody. In the
// real product the two are different credentials, and the difference is the
// whole of SPEC §10's care about approvals: the reviewer's link is signed,
// single-use, seven days, and dies the moment the franchisee edits the package.
// The dashboard link is a thirty-day bookmark. Letting the bookmark approve
// would quietly replace the first credential with the second.
//
// So this shows everything the approval email shows — the auto-approved count,
// every pending item, its spec, price, vendor, exception and mockup — and
// decides nothing. The one action it offers is to send the approval email
// again, to the address already configured on the brand, because "I can't find
// the email" is the actual reason a franchisor comes looking (DECISIONS #75).

import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, ItemStatusChip, VendorChip } from '@/components/StatusChip';
import type { BrandPublic, LineItemRow, RequestDetail } from '@/lib/db/queries';
import { fileUrl } from '@/lib/storage/url';

import { ResendApproval } from './ResendApproval';

export function Approvals({
  brand,
  brandSlug,
  token,
  requests,
}: {
  brand: BrandPublic;
  brandSlug: string;
  token: string;
  requests: RequestDetail[];
}) {
  if (requests.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-gray-900">Nothing is waiting on you</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">
          Standard package items and like-for-like replacements approve themselves under your brand
          rules. Add-ons and flagged exceptions appear here — and in your reviewer&apos;s inbox — as
          franchisees submit them.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        This is what your reviewer is looking at. Decisions are made from the approval email itself,
        where each item carries its own signed link — so a copy of this dashboard link cannot
        approve signage on your brand&apos;s behalf.
      </p>

      {requests.map((request) => (
        <RequestBlock
          key={request.id}
          brand={brand}
          brandSlug={brandSlug}
          token={token}
          request={request}
        />
      ))}
    </div>
  );
}

function RequestBlock({
  brand,
  brandSlug,
  token,
  request,
}: {
  brand: BrandPublic;
  brandSlug: string;
  token: string;
  request: RequestDetail;
}) {
  const pending = request.items.filter((item) => item.item_status === 'pending_review');
  // Said first here as it is in the email: the program's argument is that most
  // signage never reaches corporate at all, and the count is the evidence.
  const proceeding = request.items.filter(
    (item) => item.item_status === 'auto_approved' || item.item_status === 'approved',
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{request.location.name}</p>
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

      <div className="mt-3 space-y-2">
        {pending.map((item) => (
          <ItemCard key={item.id} brand={brand} item={item} />
        ))}
      </div>

      <ResendApproval brandSlug={brandSlug} token={token} requestId={request.id} />
    </section>
  );
}

function ItemCard({ brand, item }: { brand: BrandPublic; item: LineItemRow }) {
  const mockup = item.files.find((file) => file.kind === 'mockup');
  const photo = item.files.find((file) => file.kind === 'placement_photo');

  return (
    <article className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <SignThumbnail
        renderKey={item.render_key}
        label={item.brand_item_name}
        className="h-14 w-20 shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{item.brand_item_name}</h3>
          <ItemStatusChip status={item.item_status} />
        </div>
        {item.spec_summary && <p className="mt-0.5 text-xs text-gray-500">{item.spec_summary}</p>}

        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="rounded bg-gray-200/70 px-1.5 py-0.5 text-[10px] font-medium">
            {item.origin}
          </span>
          <VendorChip
            policy={item.vendor_policy_override ?? brand.vendor_policy}
            vendorName={brand.vendor_name}
            brandPolicy={brand.vendor_policy}
          />
          <span className="font-medium text-gray-900">{formatPrice(item.est_price_snapshot)}</span>
          {item.sizing && <span>{item.sizing}</span>}
        </p>

        {item.exception_issue && (
          <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">
            Why the standard sign will not work here: {item.exception_issue}
          </p>
        )}
        {item.site_notes && (
          <p className="mt-2 text-xs text-gray-600">From the franchisee: {item.site_notes}</p>
        )}
        {item.tbd_fields.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Still to be confirmed: {item.tbd_fields.join(', ')} — the Signage.com team is chasing
            it, and it does not block the decision.
          </p>
        )}
        {(mockup || photo) && (
          <p className="mt-2 flex gap-3 text-[11px]">
            {mockup && (
              <a
                href={fileUrl(mockup.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Mockup
              </a>
            )}
            {photo && (
              <a
                href={fileUrl(photo.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Site photo
              </a>
            )}
          </p>
        )}
      </div>
    </article>
  );
}
