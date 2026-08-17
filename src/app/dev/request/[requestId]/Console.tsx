'use client';

// What a corporate reviewer sees: the items that need them, and nothing else.
//
// The email Session 4 sends has exactly this shape — the auto-approved count as
// a single line, then one card per pending item with its mockup, spec, vendor
// and price, a note field, and three buttons. Building it as a screen first
// keeps the loop closed until the email exists.

import { useState, useTransition } from 'react';

import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, ItemStatusChip, VendorChip } from '@/components/StatusChip';
import type { LineItemRow, RequestDetail } from '@/lib/db/queries';
import { fileUrl } from '@/lib/storage/url';

import { decideItemAction, requestChangesAction } from '../../actions';

export function Console({ request }: { request: RequestDetail }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    startTransition(async () => {
      const failure = await fn();
      if (failure) setError(failure.error);
    });
  };

  const waiting = request.items.filter((item) => item.item_status === 'pending_review');
  const settled = request.items.filter((item) => item.item_status !== 'pending_review');
  const autoApproved = settled.filter((item) => item.item_status === 'auto_approved');

  return (
    <div className={pending ? 'pointer-events-none opacity-60' : undefined}>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {autoApproved.length > 0 && (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <strong>{autoApproved.length} item(s) are proceeding without you.</strong> Standard package
          items and like-for-like replacements carry your existing approval — that is the point of
          the program, and they are listed below for information only.
        </p>
      )}

      {waiting.length === 0 ? (
        <p className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Nothing on this request needs a decision.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {waiting.map((item) => (
            <DecisionCard key={item.id} request={request} item={item} act={act} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            The rest of this request ({settled.length})
          </h2>
          <ul className="space-y-1.5">
            {settled.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2 text-gray-700">
                  {item.brand_item_name}
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {item.origin}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatPrice(item.est_price_snapshot)}
                  </span>
                </span>
                <ItemStatusChip status={item.item_status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DecisionCard({
  request,
  item,
  act,
}: {
  request: RequestDetail;
  item: LineItemRow;
  act: (fn: () => Promise<{ error: string } | undefined>) => void;
}) {
  const [note, setNote] = useState('');
  const mockup = item.files.find((file) => file.kind === 'mockup');
  const photo = item.files.find((file) => file.kind === 'placement_photo');

  return (
    <article className="rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex gap-3">
        <SignThumbnail
          renderKey={item.render_key}
          label={item.brand_item_name}
          className="h-14 w-20 shrink-0 rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{item.brand_item_name}</h3>
            <span className="flex items-center gap-2 text-sm">
              <VendorChip
                policy={item.vendor_policy_override ?? request.brand.vendor_policy}
                vendorName={request.brand.vendor_name}
                brandPolicy={request.brand.vendor_policy}
              />
              <span className="font-medium text-gray-900">
                {formatPrice(item.est_price_snapshot)}
              </span>
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-500">{item.spec_summary}</p>
          <p className="mt-1 text-xs text-gray-600">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium">
              {item.origin}
            </span>
            {item.sizing && ` · ${item.sizing}`}
            {item.tbd_fields.length > 0 && ` · TBD: ${item.tbd_fields.join(', ')}`}
          </p>

          {item.exception_issue && (
            <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">
              Why the standard sign will not work here: {item.exception_issue}
            </p>
          )}
          {item.site_notes && <p className="mt-2 text-xs text-gray-600">{item.site_notes}</p>}

          {(mockup || photo) && (
            <p className="mt-2 flex gap-3 text-[11px]">
              {mockup && (
                <a href={fileUrl(mockup.storage_path)} target="_blank" rel="noreferrer" className="underline">
                  Mockup
                </a>
              )}
              {photo && (
                <a href={fileUrl(photo.storage_path)} target="_blank" rel="noreferrer" className="underline">
                  Site photo
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note — required to request changes, optional otherwise"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => act(() => decideItemAction(request.id, item.id, 'approved', note))}
          className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() => act(() => requestChangesAction(request.id, [item.id], note))}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Request changes
        </button>
        <button
          type="button"
          onClick={() => act(() => decideItemAction(request.id, item.id, 'declined', note))}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white"
        >
          Decline
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">
        Line-item level: whatever you decide here, the other items on this request carry on.
      </p>
    </article>
  );
}
