'use client';

// Answering a change request, in place on the status page.
//
// The demo simulates this with a single button; the real loop needs the fields
// back. Only the flagged items appear here — the rest of the request is not
// re-opened, which is the promise line-item approval makes (SPEC §7): one item
// going back and forth never puts the others on hold.

import { useState, useTransition } from 'react';

import { PhotoUpload } from '@/components/PhotoUpload';
import { SizingField } from '@/components/SizingField';
import type { LineItemRow } from '@/lib/db/queries';
import type { StoredObject } from '@/lib/storage';

import { resubmitChanges } from './actions';

interface EditState {
  sizing: string;
  tbd: boolean;
  siteNotes: string;
  photo: StoredObject | null;
}

export function ResubmitPanel({
  token,
  brandSlug,
  items,
  comment,
}: {
  token: string;
  brandSlug: string;
  /** The flagged items, in request order. */
  items: LineItemRow[];
  comment: string;
}) {
  const [edits, setEdits] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          sizing: item.sizing ?? '',
          tbd: item.tbd_fields.length > 0,
          siteNotes: item.site_notes ?? '',
          photo: null,
        },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(id: string, change: Partial<EditState>) {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const failure = await resubmitChanges({
        token,
        edits: items.map((item) => ({
          lineItemId: item.id,
          sizing: edits[item.id].sizing,
          tbd: edits[item.id].tbd,
          siteNotes: edits[item.id].siteNotes,
          photo: edits[item.id].photo,
        })),
      });
      if (failure) setError(failure.error);
    });
  }

  return (
    <section className="mt-5 rounded-xl border border-rose-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">
        Update {items.length === 1 ? 'this item' : `these ${items.length} items`} and resubmit
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Corporate&rsquo;s note: &ldquo;{comment}&rdquo;
      </p>

      <div className="mt-4 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">{item.brand_item_name}</p>
            {item.review_note && (
              <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-800">
                On this item: {item.review_note}
              </p>
            )}

            <div className="mt-3">
              <SizingField
                siteVariables={item.site_variables}
                value={edits[item.id].sizing}
                tbd={edits[item.id].tbd}
                onValueChange={(sizing) => patch(item.id, { sizing })}
                onTbdChange={(tbd) => patch(item.id, { tbd })}
              />
            </div>

            <textarea
              value={edits[item.id].siteNotes}
              onChange={(event) => patch(item.id, { siteNotes: event.target.value })}
              rows={2}
              placeholder="Anything corporate should know about this change"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />

            <div className="mt-2">
              <PhotoUpload
                label="Add an updated photo"
                prefix={brandSlug}
                value={edits[item.id].photo}
                onChange={(photo) => patch(item.id, { photo })}
              />
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-4 w-full rounded-lg py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--color-brand)' }}
      >
        {pending ? 'Resubmitting…' : 'Resubmit for review →'}
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-400">
        Only these items go back to corporate. Everything already approved keeps its approval.
      </p>
    </section>
  );
}
