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
import { StudioAdjust, hasAdjustableDesign } from '@/components/StudioAdjust';
import type { LineItemRow } from '@/lib/db/queries';
import type { SignDesign } from '@/lib/designs/design';
import type { StoredObject } from '@/lib/storage';

import { resubmitChanges } from './actions';

interface EditState {
  sizing: string;
  tbd: boolean;
  siteNotes: string;
  photo: StoredObject | null;
  /** A new Studio design; null returns to the brand's own; undefined leaves it. */
  design?: SignDesign | null;
}

/** The brand's design, when this sign can be adjusted in the Studio. */
function studioBase(item: LineItemRow): SignDesign | null {
  if (item.origin === 'replacement' || !item.brand_design) return null;
  return hasAdjustableDesign(item.brand_design, item.design_rules ?? {}) ? item.brand_design : null;
}

/** The line's design as StudioAdjust shows it: null when it is the brand's own. */
function customized(item: LineItemRow): SignDesign | null {
  if (!item.design || !item.brand_design) return null;
  return JSON.stringify(item.design) === JSON.stringify(item.brand_design) ? null : item.design;
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
          design: edits[item.id].design,
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

            {studioBase(item) ? (
              // A Studio design carries its own size; adjust it here, within the
              // brand's limits, and it is checked and priced again on resubmission.
              <StudioAdjust
                brandSlug={brandSlug}
                locationId={null}
                brandItemId={item.brand_item_id}
                base={studioBase(item)!}
                rules={item.design_rules ?? {}}
                value={edits[item.id].design === undefined ? customized(item) : (edits[item.id].design ?? null)}
                onChange={(design) => patch(item.id, { design })}
                resubmit={{ token, lineItemId: item.id }}
              />
            ) : (
              <div className="mt-3">
                <SizingField
                  siteVariables={item.site_variables}
                  value={edits[item.id].sizing}
                  tbd={edits[item.id].tbd}
                  onValueChange={(sizing) => patch(item.id, { sizing })}
                  onTbdChange={(tbd) => patch(item.id, { tbd })}
                />
              </div>
            )}

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
                token={token}
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
      <p className="mt-2 text-center text-[11px] text-gray-500">
        Only these items go back to corporate. Everything already approved keeps its approval.
      </p>
    </section>
  );
}
