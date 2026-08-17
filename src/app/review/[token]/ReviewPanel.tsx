'use client';

// The decision surface. One card per pending item, three buttons, one note.
//
// The email's per-item buttons deep-link here with ?item=&action=, so the item
// they clicked is expanded with that action pre-selected — but nothing has
// happened yet. The click that decides is the one on this page (see
// ./actions.ts: mail scanners follow links, and a scanner must not be able to
// approve a sign).

import { useState, useTransition } from 'react';

import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, ItemStatusChip, VendorChip } from '@/components/StatusChip';
import type { LineItemRow, RequestDetail } from '@/lib/db/queries';
import { fileUrl } from '@/lib/storage/url';

import { decideItemAction, requestChangesAction } from './actions';

type Action = 'approve' | 'changes' | 'decline';

export function ReviewPanel({
  token,
  request,
  focusItemId,
  focusAction,
}: {
  token: string;
  request: RequestDetail;
  focusItemId: string | null;
  focusAction: Action;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const waiting = request.items.filter((item) => item.item_status === 'pending_review');
  const proceeding = request.items.filter(
    (item) => item.item_status === 'auto_approved' || item.item_status === 'approved',
  );
  const settled = request.items.filter(
    (item) => item.item_status !== 'pending_review' && item.item_status !== 'auto_approved',
  );

  const act = (label: string, fn: () => Promise<{ error: string } | undefined>) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const failure = await fn();
      if (failure) setError(failure.error);
      else setDone(label);
    });
  };

  return (
    <div className={pending ? 'mt-6 pointer-events-none opacity-60' : 'mt-6'}>
      {/* Said first, because it is the argument the program makes. */}
      {proceeding.length > 0 && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand-dark)' }}
        >
          <strong>{proceeding.length} item(s) are already proceeding.</strong> Standard package
          signs and like-for-like replacements carry the approval you have already given.
        </p>
      )}

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {done && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>}

      {waiting.length === 0 ? (
        <p className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Every item on this request has been decided. You can close this page.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {waiting.map((item) => (
            <DecisionCard
              key={item.id}
              token={token}
              request={request}
              item={item}
              defaultOpen={item.id === focusItemId}
              defaultAction={item.id === focusItemId ? focusAction : 'approve'}
              act={act}
            />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Already decided</h2>
          <ul className="space-y-1.5">
            {settled.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-gray-700">{item.brand_item_name}</span>
                <ItemStatusChip status={item.item_status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-center text-xs text-gray-400">
        Decisions are recorded against {request.code} and are visible to the franchisee immediately.
      </p>
    </div>
  );
}

function DecisionCard({
  token,
  request,
  item,
  defaultOpen,
  defaultAction,
  act,
}: {
  token: string;
  request: RequestDetail;
  item: LineItemRow;
  defaultOpen: boolean;
  defaultAction: Action;
  act: (label: string, fn: () => Promise<{ error: string } | undefined>) => void;
}) {
  const [action, setAction] = useState<Action>(defaultAction);
  const [note, setNote] = useState('');
  const mockup = item.files.find((file) => file.kind === 'mockup');
  const photo = item.files.find((file) => file.kind === 'placement_photo');

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        defaultOpen ? 'border-gray-400 ring-1 ring-gray-200' : 'border-gray-200'
      }`}
    >
      <div className="flex gap-3">
        <SignThumbnail
          renderKey={item.render_key}
          label={item.brand_item_name}
          className="h-14 w-20 shrink-0 rounded"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{item.brand_item_name}</h3>
          {item.spec_summary && (
            <p className="mt-0.5 text-xs text-gray-500">{item.spec_summary}</p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium">
              {item.origin}
            </span>
            <VendorChip
              policy={item.vendor_policy_override ?? request.brand.vendor_policy}
              vendorName={request.brand.vendor_name}
              brandPolicy={request.brand.vendor_policy}
            />
            <span className="font-medium text-gray-900">
              {formatPrice(item.est_price_snapshot)}
            </span>
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
              Still to be confirmed: {item.tbd_fields.join(', ')} — being chased, and it does not
              block your decision.
            </p>
          )}
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

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ['approve', 'Approve'],
            ['changes', 'Request changes'],
            ['decline', 'Decline'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setAction(value)}
            aria-pressed={action === value}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              action === value
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder={
          action === 'changes'
            ? 'What needs to change? The franchisee sees this and acts on it.'
            : 'Optional note — e.g. “approved, dining area only”'
        }
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      <button
        type="button"
        disabled={action === 'changes' && !note.trim()}
        onClick={() => {
          if (action === 'changes') {
            act(`Sent back to the franchisee: ${item.brand_item_name}.`, () =>
              requestChangesAction({ token, lineItemIds: [item.id], comment: note }),
            );
          } else {
            const decision = action === 'approve' ? 'approved' : 'declined';
            act(`${item.brand_item_name} ${decision}.`, () =>
              decideItemAction({ token, lineItemId: item.id, decision, note }),
            );
          }
        }}
        className="mt-2 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{
          background:
            action === 'approve'
              ? 'var(--color-brand)'
              : action === 'changes'
                ? '#d97706'
                : '#e11d48',
        }}
      >
        {action === 'approve'
          ? 'Approve this sign'
          : action === 'changes'
            ? 'Send back with this note'
            : 'Decline this sign'}
      </button>
      {action === 'changes' && !note.trim() && (
        <p className="mt-1 text-[11px] text-gray-400">A note is required to request changes.</p>
      )}
      <p className="mt-1.5 text-[11px] text-gray-400">
        Decided item by item — whatever you choose, the rest of this request carries on.
      </p>
    </article>
  );
}
