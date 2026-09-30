'use client';

import { useState, useTransition } from 'react';

import type { SubmitFailure } from '@/lib/forms';

import {
  addMasterVariantAction,
  approveSignAction,
  declineSignAction,
  setMasterActiveAction,
  setSignActiveAction,
  setSignPriceAction,
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
  standin,
}: {
  itemId: string;
  name: string;
  specSummary: string;
  standin: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [spec, setSpec] = useState(initialSpec);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const { error, pending, go } = useAction();

  return (
    <div className="mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Name
          <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">
          Price estimate
          {standin ? (
            <p className="mt-1 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm text-gray-500">
              Custom quote (no pricing model)
            </p>
          ) : (
            <input
              className={`${input} mt-1 w-full`}
              value={price}
              inputMode="decimal"
              placeholder="e.g. 2400 — empty for custom quote"
              onChange={(e) => setPrice(e.target.value)}
            />
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

export function PriceEditor({
  itemId,
  price,
  standin,
}: {
  itemId: string;
  price: string | null;
  standin: boolean;
}) {
  const shown = price === null ? 'Custom quote' : `$${Number(price).toLocaleString('en-US')}`;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(price === null ? '' : String(Number(price)));
  const { error, pending, go } = useAction();

  if (standin) return <span className="text-xs text-gray-500">Custom quote</span>;
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-gray-900 underline-offset-2 hover:underline">
        {shown}
      </button>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          className={`${input} w-24`}
          value={value}
          inputMode="decimal"
          aria-label="Price"
          placeholder="custom"
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => go(() => setSignPriceAction(itemId, value), () => setEditing(false))}
          className="text-xs font-medium text-gray-900 underline-offset-2 hover:underline disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500">
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
              `Retire ${name}? It leaves the catalog and every package at once. Stores that have it keep it, but cannot order it again.`,
            )
          ) {
            return;
          }
          go(() => setSignActiveAction(itemId, !active));
        }}
        className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${active ? 'text-rose-700' : 'text-gray-700'}`}
      >
        {pending ? '…' : active ? 'Retire' : 'Reinstate'}
      </button>
      <ErrorLine error={error} />
    </>
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
      <div className="grid gap-2 sm:grid-cols-3">
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
