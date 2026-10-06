'use client';

// The Signage.com catalog, as a browsable list: search and filters on top,
// then placement → category → sign type, each sign type a card whose
// variants line up in columns. Filtering happens here, in the browser; every
// change still goes through the same server actions.

import { useMemo, useState } from 'react';

import { ImageUpload } from '@/components/ImageUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import type { MasterRow, PriceMode } from '@/lib/catalog/manage';

import { setSignTypeIconAction } from './actions';
import { MasterToggle, OptionsEditor, PriceModeSelect } from './CatalogControls';

function variantName(row: { sign_type: string; variant: string | null }) {
  return row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
}

type Placement = 'all' | 'indoor' | 'outdoor';

export function MasterCatalog({ rows }: { rows: MasterRow[] }) {
  const [search, setSearch] = useState('');
  const [placement, setPlacement] = useState<Placement>('all');
  const [mode, setMode] = useState<PriceMode | 'all'>('all');
  const [inUse, setInUse] = useState(false);

  const counts = useMemo(() => {
    const byMode = { studio: 0, fixed: 0, custom: 0 } as Record<PriceMode, number>;
    for (const row of rows) byMode[row.price_mode] += 1;
    return byMode;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (placement === 'all' || row.placement === placement) &&
        (mode === 'all' || row.price_mode === mode) &&
        (!inUse || row.brand_items > 0) &&
        (!needle || `${row.category} ${row.sign_type} ${row.variant ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [rows, search, placement, mode, inUse]);

  // placement → category → sign type → variants
  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, Map<string, MasterRow[]>>>();
    for (const row of shown) {
      const byCategory = out.get(row.placement) ?? new Map<string, Map<string, MasterRow[]>>();
      const byType = byCategory.get(row.category) ?? new Map<string, MasterRow[]>();
      byType.set(row.sign_type, [...(byType.get(row.sign_type) ?? []), row]);
      byCategory.set(row.category, byType);
      out.set(row.placement, byCategory);
    }
    return out;
  }, [shown]);

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-1 mt-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sign types and variants"
            aria-label="Search the catalog"
            className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <Segmented
            label="Placement"
            value={placement}
            onChange={setPlacement}
            options={[
              { value: 'all', label: 'All' },
              { value: 'indoor', label: 'Indoor' },
              { value: 'outdoor', label: 'Outdoor' },
            ]}
          />
          <Segmented
            label="Price from"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'all', label: 'Any price' },
              { value: 'studio', label: `Studio · ${counts.studio}` },
              { value: 'fixed', label: `Fixed · ${counts.fixed}` },
              { value: 'custom', label: `Custom · ${counts.custom}` },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" checked={inUse} onChange={(event) => setInUse(event.target.checked)} />
            Used by a brand
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Showing {shown.length} of {rows.length} variants · {rows.filter((row) => row.active).length} switched on
        </p>
      </div>

      {shown.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          Nothing matches. Clear the search or filters.
        </p>
      )}

      <div className="mt-4 space-y-8">
        {[...grouped.entries()].map(([place, byCategory]) => (
          <div key={place}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{place}</h3>
            <div className="mt-2 space-y-5">
              {[...byCategory.entries()].map(([category, byType]) => (
                <div key={category}>
                  <p className="text-sm font-semibold text-gray-900">
                    {category}{' '}
                    <span className="font-normal text-gray-500">
                      · {[...byType.values()].reduce((n, variants) => n + variants.length, 0)} variants
                    </span>
                  </p>
                  <div className="mt-2 grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                    {[...byType.entries()].map(([signType, variants]) => (
                      <SignTypeCard key={signType} signType={signType} variants={variants} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignTypeCard({ signType, variants }: { signType: string; variants: MasterRow[] }) {
  const brandSigns = variants.reduce((n, row) => n + row.brand_items, 0);
  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white" data-type-icon={signType}>
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <ImageUpload
          label="icon"
          hasImage={variants.some((v) => v.icon_path)}
          save={setSignTypeIconAction.bind(null, variants[0].id)}
        >
          <SignThumbnail
            renderKey={variants.find((v) => v.render_key)?.render_key ?? null}
            imagePath={variants.find((v) => v.icon_path)?.icon_path ?? null}
            label={signType}
            className="block h-10 w-14 rounded-md"
          />
        </ImageUpload>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{signType}</p>
          <p className="text-xs text-gray-500">
            {variants.length} variant{variants.length === 1 ? '' : 's'}
            {brandSigns > 0 && ` · ${brandSigns} brand sign${brandSigns === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>
      <ul className="divide-y divide-gray-100">
        {variants.map((row) => (
          <VariantRow key={row.id} row={row} />
        ))}
      </ul>
    </article>
  );
}

function VariantRow({ row }: { row: MasterRow }) {
  const [editing, setEditing] = useState(false);
  const options = Object.keys(row.options).length;
  return (
    <li className="px-4 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`min-w-32 flex-1 text-sm ${row.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
          {row.variant ?? 'Standard'}
          {!row.active && <span className="ml-1.5 text-[11px] no-underline">(off)</span>}
        </span>
        <PriceModeSelect masterId={row.id} name={variantName(row)} mode={row.price_mode} brandSigns={row.brand_items} compact />
        <span className={`w-16 text-right ${row.brand_items > 0 ? 'font-medium text-gray-700' : 'text-gray-400'}`}>
          {row.brand_items > 0 ? `${row.brand_items} in use` : 'unused'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-gray-500">
        <span>
          {options} option{options === 1 ? '' : 's'}
        </span>
        <span aria-hidden>·</span>
        <MasterToggle masterId={row.id} active={row.active} />
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="underline-offset-2 hover:text-gray-900 hover:underline"
        >
          {editing ? 'Close options' : 'Edit options'}
        </button>
      </div>
      {editing && (
        <OptionsEditor
          masterId={row.id}
          name={variantName(row)}
          options={row.options}
          renderKey={row.render_key}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
