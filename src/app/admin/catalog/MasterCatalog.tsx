'use client';

// The Signage.com catalog as one table: search and filters on top, then each
// sign type as a group row with its variants beneath, in aligned columns.
// Filtering happens here, in the browser; every change still goes through the
// same server actions.

import { Fragment, useMemo, useState } from 'react';

import { ImageUpload } from '@/components/ImageUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import type { MasterRow, PriceMode } from '@/lib/catalog/manage';

import { setSignTypeIconAction } from './actions';
import { AddVariantForm, MasterToggle, OptionsEditor, PriceModeSelect } from './CatalogControls';

function variantName(row: { sign_type: string; variant: string | null }) {
  return row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
}

type Placement = 'all' | 'indoor' | 'outdoor';

export function MasterCatalog({ rows, categories }: { rows: MasterRow[]; categories: string[] }) {
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

  // One group per sign type and placement, in catalog order.
  const groups = useMemo(() => {
    const out = new Map<string, MasterRow[]>();
    for (const row of shown) {
      const key = `${row.placement}|${row.category}|${row.sign_type}`;
      out.set(key, [...(out.get(key) ?? []), row]);
    }
    return [...out.values()];
  }, [shown]);

  const filtered = search.trim() !== '' || placement !== 'all' || mode !== 'all' || inUse;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sign types and variants"
          aria-label="Search the catalog"
          className="min-w-56 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
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
            { value: 'studio', label: `Studio ${counts.studio}` },
            { value: 'fixed', label: `Fixed ${counts.fixed}` },
            { value: 'custom', label: `Custom ${counts.custom}` },
          ]}
        />
        <label className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700">
          <input type="checkbox" checked={inUse} onChange={(event) => setInUse(event.target.checked)} />
          In use
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {filtered ? `${shown.length} of ${rows.length} variants match` : `${rows.length} variants`} ·{' '}
          {rows.filter((row) => row.active).length} switched on
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPlacement('all');
                setMode('all');
                setInUse(false);
              }}
              className="ml-2 font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </p>
        <AddVariantForm categories={categories} />
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Variant</th>
              <th className="px-3 py-2.5 font-medium">Price from</th>
              <th className="px-3 py-2.5 text-right font-medium">Brand signs</th>
              <th className="px-3 py-2.5 text-right font-medium">Options</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          {groups.map((variants) => (
            <SignTypeGroup key={variants[0].id} variants={variants} />
          ))}
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  Nothing matches. Clear the search or filters.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

function SignTypeGroup({ variants }: { variants: MasterRow[] }) {
  const first = variants[0];
  const inUse = variants.reduce((n, row) => n + row.brand_items, 0);
  return (
    <tbody className="border-t border-gray-200 first-of-type:border-t-0" data-type-icon={first.sign_type}>
      <tr className="bg-gray-50/70">
        <td colSpan={6} className="px-4 py-2">
          <div className="flex items-center gap-3">
            <ImageUpload
              label="icon"
              hasImage={variants.some((v) => v.icon_path)}
              save={setSignTypeIconAction.bind(null, first.id)}
            >
              <SignThumbnail
                renderKey={variants.find((v) => v.render_key)?.render_key ?? null}
                imagePath={variants.find((v) => v.icon_path)?.icon_path ?? null}
                label={first.sign_type}
                className="block h-9 w-12 rounded-md"
              />
            </ImageUpload>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{first.sign_type}</p>
              <p className="text-xs text-gray-500">
                {first.category} · {first.placement === 'indoor' ? 'Indoor' : 'Outdoor'}
                {inUse > 0 && ` · ${inUse} brand sign${inUse === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </td>
      </tr>
      {variants.map((row) => (
        <VariantRow key={row.id} row={row} />
      ))}
    </tbody>
  );
}

function VariantRow({ row }: { row: MasterRow }) {
  const [editing, setEditing] = useState(false);
  const options = Object.keys(row.options).length;
  return (
    <Fragment>
      <tr className="border-t border-gray-100 hover:bg-gray-50/60">
        <td className="py-2 pl-[4.75rem] pr-3">
          <span className={row.active ? 'text-gray-900' : 'text-gray-400'}>{row.variant ?? 'Standard'}</span>
        </td>
        <td className="px-3 py-2">
          <PriceModeSelect
            masterId={row.id}
            name={variantName(row)}
            mode={row.price_mode}
            brandSigns={row.brand_items}
            compact
          />
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${row.brand_items > 0 ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
          {row.brand_items}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{options}</td>
        <td className="px-3 py-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              row.active ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {row.active ? 'On' : 'Off'}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
          <span className="inline-flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              className="font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline"
            >
              {editing ? 'Close' : 'Edit options'}
            </button>
            <MasterToggle masterId={row.id} active={row.active} />
          </span>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <OptionsEditor
              masterId={row.id}
              name={variantName(row)}
              options={row.options}
              renderKey={row.render_key}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </Fragment>
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
