'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { PriceMode } from '@/lib/catalog/manage';
import type { SubmitFailure } from '@/lib/forms';

import {
  addMasterVariantAction,
  approveSignAction,
  declineSignAction,
  setMasterActiveAction,
  setMasterPriceModeAction,
  setSignActiveAction,
  setSignPriceAction,
  updateMasterOptionsAction,
} from './actions';

const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function go(fn: () => Promise<SubmitFailure | undefined>, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else done?.();
    });
  }
  return { error, pending, go };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null;
}

/** Approve at a price, or decline with a reason. */
export function ReviewForm({
  itemId,
  name: initialName,
  specSummary: initialSpec,
  mode,
}: {
  itemId: string;
  name: string;
  specSummary: string;
  /** Where the sign's price comes from: decides what the price field asks for. */
  mode: PriceMode;
}) {
  const [name, setName] = useState(initialName);
  const [spec, setSpec] = useState(initialSpec);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const { error, pending, go } = useAction();

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Name
          <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          {mode === 'fixed' ? 'Fixed price' : mode === 'studio' ? 'Price estimate (optional)' : 'Price'}
          {mode === 'custom' ? (
            <p className="mt-1 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm text-gray-500">
              Custom quote: priced on each order
            </p>
          ) : (
            <>
              <input
                className={`${input} mt-1 w-full`}
                value={price}
                inputMode="decimal"
                placeholder={mode === 'fixed' ? 'e.g. 450' : 'e.g. 2400'}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="mt-1 block text-[11px] text-gray-500">
                {mode === 'fixed'
                  ? 'Required. Every order of this sign uses it.'
                  : 'The Design Studio sets the price once the brand designs this sign.'}
              </span>
            </>
          )}
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        Spec line (shown to franchisees and in emails)
        <input className={`${input} mt-1 w-full`} value={spec} onChange={(e) => setSpec(e.target.value)} />
      </label>
      <label className="block text-xs text-gray-600">
        Note to the brand (required to decline)
        <input className={`${input} mt-1 w-full`} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => go(() => approveSignAction(itemId, { name, specSummary: spec, price, note }))}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Approve and make live
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => go(() => declineSignAction(itemId, note))}
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
        >
          Decline
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

/**
 * A brand sign's price, as the team sets it (DECISIONS #179). What it offers
 * follows where the price comes from: a custom quote has none, an engine
 * price is the Studio's, and a fixed price (or a Studio sign not designed
 * yet) is typed here. A fixed-price sign without one is flagged.
 */
export function PriceEditor({
  itemId,
  price,
  mode,
  engine,
}: {
  itemId: string;
  price: string | null;
  mode: PriceMode;
  /** The Design Studio set this price when the brand saved its design. */
  engine: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price === null ? '' : String(Number(price)));
  const { error, pending, go } = useAction();
  const amount = price === null ? null : `$${Number(price).toLocaleString('en-US')}`;

  if (mode === 'custom') {
    return <span className="text-xs text-gray-500">Quoted per order</span>;
  }
  if (mode === 'studio' && engine) {
    return (
      <span className="text-sm text-gray-900" title="Priced by the Design Studio when the brand saved its design">
        {amount ?? '—'}
        <span className="ml-1 text-[11px] text-gray-500">from the Studio</span>
      </span>
    );
  }

  const save = () => go(() => setSignPriceAction(itemId, value), () => setEditing(false));

  if (!editing) {
    if (amount === null) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          {mode === 'fixed' ? 'Set price' : 'Set an estimate'}
        </button>
      );
    }
    return (
      <span className="inline-flex items-baseline gap-2">
        <span className="text-sm text-gray-900">{amount}</span>
        {mode === 'studio' && <span className="text-[11px] text-gray-500">until designed</span>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          Edit
        </button>
      </span>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
          <input
            autoFocus
            className={`${input} w-28 pl-5`}
            value={value}
            inputMode="decimal"
            aria-label="Price"
            placeholder="0"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-900">
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function SignActiveToggle({ itemId, name, active }: { itemId: string; name: string; active: boolean }) {
  const { error, pending, go } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            active &&
            !window.confirm(
              `Deactivate ${name}? It leaves the catalog and every package at once. Stores that have it keep it; replacing it needs corporate approval, and nobody can order a new one.`,
            )
          ) {
            return;
          }
          go(() => setSignActiveAction(itemId, !active));
        }}
        className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${active ? 'text-gray-500 hover:text-rose-700' : 'text-gray-700'}`}
      >
        {pending ? '…' : active ? 'Deactivate' : 'Activate'}
      </button>
      <ErrorLine error={error} />
    </>
  );
}

const PRICE_MODES: { value: PriceMode; label: string; hint: string }[] = [
  { value: 'studio', label: 'Design Studio', hint: 'The Studio engine prices each design, plus the margin set in Settings.' },
  { value: 'fixed', label: 'Fixed price', hint: 'Signage.com sets each brand sign’s price here; the Studio only draws it.' },
  { value: 'custom', label: 'Custom quote', hint: 'Priced by the team on every order.' },
];

/** The same colours as the "Price from" badges on the brand signs table. */
const SELECT_TONE: Record<PriceMode, string> = {
  studio: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  fixed: 'border-sky-200 bg-sky-50 text-sky-800',
  custom: 'border-amber-200 bg-amber-50 text-amber-800',
};

/** Where a sign type's price comes from (DECISIONS #179). */
export function PriceModeSelect({
  masterId,
  name,
  mode,
  brandSigns,
  compact = false,
}: {
  masterId: string;
  name: string;
  mode: PriceMode;
  brandSigns: number;
  /** Without the visible "Price from" label, where a column or badge says it. */
  compact?: boolean;
}) {
  const { pending, error, go } = useAction();
  const [switchedToFixed, setSwitchedToFixed] = useState(false);
  return (
    <span className="inline-flex flex-col">
      <label className="inline-flex items-center gap-1.5 text-gray-500">
        {!compact && 'Price from'}
        <select
          value={mode}
          disabled={pending}
          aria-label={`${name}: price from`}
          title={PRICE_MODES.find((option) => option.value === mode)?.hint}
          onChange={(event) => {
            const next = event.target.value as PriceMode;
            if (
              next === 'custom' &&
              brandSigns > 0 &&
              !window.confirm(
                `${brandSigns} brand sign${brandSigns === 1 ? '' : 's'} use ${name}. Their prices will be cleared and each order quoted by hand. Continue?`,
              )
            ) {
              return;
            }
            go(
              () => setMasterPriceModeAction(masterId, next),
              () => setSwitchedToFixed(next === 'fixed' && brandSigns > 0),
            );
          }}
          className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${
            compact ? SELECT_TONE[mode] : 'border-gray-300 bg-white text-gray-800'
          }`}
        >
          {PRICE_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {switchedToFixed && mode === 'fixed' && (
        <Link href="/admin/catalog?tab=brand" className="mt-1 text-[11px] font-medium text-sky-800 underline underline-offset-2">
          Set {brandSigns === 1 ? 'its brand sign’s price' : `prices for its ${brandSigns} brand signs`} →
        </Link>
      )}
      <ErrorLine error={error} />
    </span>
  );
}

export function MasterToggle({ masterId, active }: { masterId: string; active: boolean }) {
  const { pending, go } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => go(() => setMasterActiveAction(masterId, !active))}
      className="text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
    >
      {pending ? '…' : active ? 'Switch off' : 'Switch on'}
    </button>
  );
}

export function AddVariantForm({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'indoor' | 'outdoor'>('outdoor');
  const [category, setCategory] = useState('');
  const [signType, setSignType] = useState('');
  const [variant, setVariant] = useState('');
  const [pricingBasis, setPricingBasis] = useState<'direct' | 'standin'>('standin');
  const [renderKey, setRenderKey] = useState('');
  const { error, pending, go } = useAction();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        Add a sign type or variant
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        go(
          () =>
            addMasterVariantAction({
              placement,
              category,
              signType,
              variant: variant || null,
              pricingBasis,
              renderKey: renderKey || null,
            }),
          () => {
            setOpen(false);
            setSignType('');
            setVariant('');
            setRenderKey('');
          },
        );
      }}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs text-gray-600">
          Placement
          <select
            className={`${input} mt-1 w-full`}
            value={placement}
            onChange={(e) => setPlacement(e.target.value as 'indoor' | 'outdoor')}
          >
            <option value="outdoor">Outdoor</option>
            <option value="indoor">Indoor</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Category
          <input
            className={`${input} mt-1 w-full`}
            list="catalog-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
          <datalist id="catalog-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-gray-600">
          Pricing
          <select
            className={`${input} mt-1 w-full`}
            value={pricingBasis}
            onChange={(e) => setPricingBasis(e.target.value as 'direct' | 'standin')}
          >
            <option value="standin">Custom quote (no pricing model)</option>
            <option value="direct">Priced directly</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Sign type
          <input className={`${input} mt-1 w-full`} value={signType} onChange={(e) => setSignType(e.target.value)} required />
        </label>
        <label className="text-xs text-gray-600">
          Variant (optional)
          <input className={`${input} mt-1 w-full`} value={variant} onChange={(e) => setVariant(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Render key (optional)
          <input
            className={`${input} mt-1 w-full`}
            value={renderKey}
            placeholder="e.g. face-lit-channel"
            onChange={(e) => setRenderKey(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        A new variant of an existing sign type starts with that type&apos;s options and pricing model.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Add to catalog
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600">
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

/**
 * Which choices a catalog row offers brands — one list per attribute, one
 * option per line. Brand signs that already locked a removed value keep it.
 */
export function OptionsEditor({
  masterId,
  name,
  options,
  renderKey,
  onClose,
}: {
  masterId: string;
  name: string;
  options: Record<string, string[]>;
  renderKey: string | null;
  /** Opened and closed by the parent row; without it, the editor has its own button. */
  onClose?: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = onClose ? true : ownOpen;
  const setOpen = (next: boolean) => (onClose ? !next && onClose() : setOwnOpen(next));
  const [rows, setRows] = useState<{ attribute: string; values: string }[]>(
    Object.entries(options).map(([attribute, values]) => ({ attribute, values: values.join('\n') })),
  );
  const [key, setKey] = useState(renderKey ?? '');
  const { error, pending, go } = useAction();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
      >
        Edit options
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3" data-options-editor={name}>
      <p className="text-xs font-medium text-gray-800">
        Options brands can lock for {name}. One option per line; an empty list removes the attribute.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row, index) => (
          <div key={index}>
            <input
              className={`${input} w-full text-xs font-medium`}
              value={row.attribute}
              aria-label="Attribute"
              placeholder="attribute, e.g. mounting_type"
              onChange={(e) =>
                setRows((c) => c.map((r, i) => (i === index ? { ...r, attribute: e.target.value } : r)))
              }
            />
            <textarea
              className={`${input} mt-1 w-full text-xs`}
              rows={Math.max(3, row.values.split('\n').length)}
              value={row.values}
              aria-label={`Options for ${row.attribute || 'new attribute'}`}
              onChange={(e) =>
                setRows((c) => c.map((r, i) => (i === index ? { ...r, values: e.target.value } : r)))
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => setRows((c) => [...c, { attribute: '', values: '' }])}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800"
        >
          Add an attribute
        </button>
        <label className="text-xs text-gray-600">
          Render key
          <input className={`${input} ml-2 w-48 text-xs`} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
      </div>
      <p className="text-[11px] text-gray-500">
        New options are not priced by the pricing engine until Design Studio is kept in step; brand signs
        that already locked a removed option keep it.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            go(
              () =>
                updateMasterOptionsAction(
                  masterId,
                  Object.fromEntries(rows.map((r) => [r.attribute, r.values.split('\n')])),
                  key,
                ),
              () => setOpen(false),
            )
          }
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Save options
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-600">
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}
