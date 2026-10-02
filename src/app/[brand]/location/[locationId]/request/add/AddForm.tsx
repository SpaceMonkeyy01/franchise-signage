'use client';

import { useState, useTransition } from 'react';

import { CatalogCard } from '@/components/CatalogCard';
import { SizingField } from '@/components/SizingField';
import { StudioAdjust, hasAdjustableDesign } from '@/components/StudioAdjust';
import { formatPrice } from '@/components/StatusChip';
import type { BrandItemRow, BrandPublic } from '@/lib/db/queries';
import type { SignDesign } from '@/lib/designs/design';

import { submitAddSigns } from './actions';

interface Selection {
  sizing: string;
  tbd: boolean;
  /** Adjusted in the Studio (SPEC v2.6 §8); null keeps the brand's design. */
  design: SignDesign | null;
}

/** What a chosen sign costs: its Studio price when adjusted, else the catalog's. */
function priceOf(item: BrandItemRow, selection: Selection | undefined): number | null {
  if (selection?.design?.price) return selection.design.price;
  return item.est_price === null ? null : Number(item.est_price);
}

export function AddForm({
  brand,
  locationId,
  catalog,
  installedItemIds,
}: {
  brand: BrandPublic;
  locationId: string;
  catalog: BrandItemRow[];
  installedItemIds: string[];
}) {
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = catalog.filter((item) => selected[item.id]);
  const priced = chosen.filter((item) => priceOf(item, selected[item.id]) !== null);
  const total = priced.reduce((sum, item) => sum + (priceOf(item, selected[item.id]) ?? 0), 0);

  function toggle(id: string) {
    setSelected((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = { sizing: '', tbd: false, design: null };
      return next;
    });
  }

  function patch(id: string, change: Partial<Selection>) {
    setSelected((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const failure = await submitAddSigns({
        brandSlug: brand.slug,
        locationId,
        items: chosen.map((item) => ({
          brandItemId: item.id,
          sizing: selected[item.id].sizing.trim() || null,
          tbd: selected[item.id].tbd,
          design: selected[item.id].design,
        })),
      });
      if (failure) setError(failure.error);
    });
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.map((item) => (
          <CatalogCard
            key={item.id}
            item={item}
            brand={brand}
            selected={Boolean(selected[item.id])}
            installed={installedItemIds.includes(item.id)}
            onToggle={() => toggle(item.id)}
          >
            <SizingField
              siteVariables={item.site_variables}
              value={selected[item.id]?.sizing ?? ''}
              tbd={selected[item.id]?.tbd ?? false}
              onValueChange={(value) => patch(item.id, { sizing: value })}
              onTbdChange={(tbd) => patch(item.id, { tbd })}
            />
            {selected[item.id] && hasAdjustableDesign(item.design, item.design_rules) && (
              <StudioAdjust
                brandSlug={brand.slug}
                locationId={locationId}
                brandItemId={item.id}
                base={item.design}
                rules={item.design_rules}
                value={selected[item.id].design}
                onChange={(design) => patch(item.id, { design })}
              />
            )}
          </CatalogCard>
        ))}
      </div>

      {chosen.length > 0 && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">
              Estimated total ({priced.length} priced item{priced.length === 1 ? '' : 's'})
            </span>
            <span className="font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
              {formatPrice(total)}
            </span>
          </div>
          {chosen.length > priced.length && (
            <p className="mt-1 text-[11px] text-gray-500">
              + {chosen.length - priced.length} custom-quote item
              {chosen.length - priced.length === 1 ? '' : 's'} priced by the Signage.com team after
              submission
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={chosen.length === 0 || pending}
        className="mt-4 w-full rounded-lg py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--color-brand)' }}
      >
        {pending
          ? 'Submitting…'
          : `Submit ${chosen.length || ''} sign request${chosen.length === 1 ? '' : 's'} for approval →`}
      </button>
    </div>
  );
}
