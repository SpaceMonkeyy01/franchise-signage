'use client';

// Standard packages, per store type (SPEC v2.4 §2.3).
//
// A package is what a new store of that type starts with: the checklist a
// franchisee sees at setup, the signs that auto-approve (SPEC §7), and the
// number on the budget one-pager. A brand admin edits it here and it is live
// at once for the next store set up; requests already made are untouched.
// Only live signs can be added. Reviewers read.
//
// Store types are the brand's own (DECISIONS #156): add "Drive-thru", rename,
// reorder, retire. Each has one package.

import { useState, useTransition } from 'react';

import { SignThumbnail } from '@/components/SignThumbnail';
import type { ManagedPackage, ManagedSign, PackageFormat, StoreType } from '@/lib/catalog/manage';
import type { SubmitFailure } from '@/lib/forms';

import {
  addStoreTypeAction,
  moveStoreTypeAction,
  savePackageAction,
  setStoreTypeActiveAction,
  updateStoreTypeAction,
} from './catalog-actions';

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

export function Packages({
  brandSlug,
  canManage,
  storeTypes,
  packages,
  signs,
}: {
  brandSlug: string;
  canManage: boolean;
  storeTypes: StoreType[];
  packages: ManagedPackage[];
  /** Live signs: the only ones a package can hold. */
  signs: ManagedSign[];
}) {
  const live = storeTypes.filter((t) => t.active);
  const retired = storeTypes.filter((t) => !t.active);
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-gray-900">Store types and their standard packages</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
        A franchisee setting up a store picks its type, and starts with that type&apos;s package. These signs are
        pre-loaded and approved automatically; anything else a franchisee adds comes to you for approval. Changes
        apply to the next store set up.
      </p>
      <div className="mt-3 space-y-3">
        {live.map((storeType, index) => (
          <PackageCard
            key={storeType.key}
            brandSlug={brandSlug}
            canManage={canManage}
            storeType={storeType}
            first={index === 0}
            last={index === live.length - 1}
            pkg={packages.find((p) => p.format === storeType.key) ?? null}
            signs={signs}
          />
        ))}
      </div>
      {canManage && <AddStoreType brandSlug={brandSlug} />}
      {retired.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inactive store types</p>
          <ul className="mt-1 space-y-1">
            {retired.map((storeType) => (
              <RetiredStoreType key={storeType.key} brandSlug={brandSlug} canManage={canManage} storeType={storeType} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AddStoreType({ brandSlug }: { brandSlug: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const { error, pending, go } = useAction();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        Add a store type
      </button>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        go(
          () => addStoreTypeAction(brandSlug, { label, description: description || null }),
          () => {
            setOpen(false);
            setLabel('');
            setDescription('');
          },
        );
      }}
      className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Store type
          <input
            className={`${input} mt-1 w-full`}
            value={label}
            placeholder="e.g. Drive-thru, Mall in-line, Food court kiosk"
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          What it is (shown at setup)
          <input
            className={`${input} mt-1 w-full`}
            value={description}
            placeholder="e.g. Pad site with a drive-thru lane"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Add store type
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600">
          Cancel
        </button>
      </div>
      <p className="text-xs text-gray-500">It starts with an empty package, for you to fill.</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </form>
  );
}

function RetiredStoreType({
  brandSlug,
  canManage,
  storeType,
}: {
  brandSlug: string;
  canManage: boolean;
  storeType: StoreType;
}) {
  const { error, pending, go } = useAction();
  return (
    <li className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
      <span>{storeType.label}</span>
      <span className="text-xs text-gray-500">
        {storeType.locations} store{storeType.locations === 1 ? '' : 's'}
      </span>
      {canManage && (
        <button
          type="button"
          disabled={pending}
          onClick={() => go(() => setStoreTypeActiveAction(brandSlug, storeType.key, true))}
          className="text-xs text-gray-700 underline-offset-2 hover:underline disabled:opacity-40"
        >
          Activate
        </button>
      )}
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </li>
  );
}

function totals(items: string[], byId: Map<string, ManagedSign>) {
  let priced = 0;
  let custom = 0;
  for (const id of items) {
    const sign = byId.get(id);
    if (!sign) continue;
    if (sign.est_price === null) custom += 1;
    else priced += Number(sign.est_price);
  }
  return { priced, custom };
}

function PackageCard({
  brandSlug,
  canManage,
  storeType,
  first,
  last,
  pkg,
  signs,
}: {
  brandSlug: string;
  canManage: boolean;
  storeType: StoreType;
  first: boolean;
  last: boolean;
  pkg: ManagedPackage | null;
  signs: ManagedSign[];
}) {
  const format: PackageFormat = storeType.key;
  const formatLabel = storeType.label;
  const typeAction = useAction();
  const [renaming, setRenaming] = useState(false);
  const [typeLabel, setTypeLabel] = useState(storeType.label);
  const [typeDescription, setTypeDescription] = useState(storeType.description ?? '');
  const byId = new Map(signs.map((sign) => [sign.id, sign]));
  // A package can still list a sign retired since; it is shown, and saving drops it.
  const saved = pkg?.items.filter((id) => byId.has(id)) ?? [];
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>(saved);
  const [label, setLabel] = useState(pkg?.label ?? `${formatLabel} store`);
  const [description, setDescription] = useState(pkg?.description ?? '');
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = editing ? items : saved;
  const { priced, custom } = totals(shown, byId);

  function move(index: number, by: -1 | 1) {
    setItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePackageAction(brandSlug, { format, label, description: description || null, items });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4" data-package={format}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className={`${input} w-44`}
                value={typeLabel}
                aria-label="Store type name"
                onChange={(e) => setTypeLabel(e.target.value)}
              />
              <input
                className={`${input} min-w-0 flex-1`}
                value={typeDescription}
                aria-label="Store type description"
                placeholder="What it is (shown at setup)"
                onChange={(e) => setTypeDescription(e.target.value)}
              />
              <button
                type="button"
                disabled={typeAction.pending}
                onClick={() =>
                  typeAction.go(
                    () =>
                      updateStoreTypeAction(brandSlug, format, {
                        label: typeLabel,
                        description: typeDescription || null,
                      }),
                    () => setRenaming(false),
                  )
                }
                className="text-xs font-medium text-gray-900 underline-offset-2 hover:underline"
              >
                Save
              </button>
              <button type="button" onClick={() => setRenaming(false)} className="text-xs text-gray-500">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{formatLabel} stores</p>
              {storeType.description && <p className="text-xs text-gray-500">{storeType.description}</p>}
              {canManage && !editing && (
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <button
                    type="button"
                    disabled={first || typeAction.pending}
                    onClick={() => typeAction.go(() => moveStoreTypeAction(brandSlug, format, -1))}
                    aria-label={`Move ${formatLabel} up`}
                    className="disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={last || typeAction.pending}
                    onClick={() => typeAction.go(() => moveStoreTypeAction(brandSlug, format, 1))}
                    aria-label={`Move ${formatLabel} down`}
                    className="disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => setRenaming(true)} className="underline-offset-2 hover:underline">
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={typeAction.pending}
                    onClick={() => {
                      const stores = `${storeType.locations} store${storeType.locations === 1 ? '' : 's'}`;
                      if (
                        window.confirm(
                          `Deactivate the ${formatLabel} store type? New stores can no longer be set up as ${formatLabel}; the ${stores} already set up keep it.`,
                        )
                      ) {
                        typeAction.go(() => setStoreTypeActiveAction(brandSlug, format, false));
                      }
                    }}
                    className="text-rose-700 underline-offset-2 hover:underline"
                  >
                    Deactivate
                  </button>
                </span>
              )}
            </div>
          )}
          {typeAction.error && <p className="text-xs text-rose-700">{typeAction.error}</p>}
          {editing ? (
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={input} value={label} aria-label="Package name" onChange={(e) => setLabel(e.target.value)} />
              <input
                className={input}
                value={description}
                aria-label="Package description"
                placeholder="Short description (optional)"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-900">{pkg ? pkg.label : 'No package yet'}</p>
              {pkg?.description && <p className="text-xs text-gray-500">{pkg.description}</p>}
            </>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">
            {priced > 0 ? `$${priced.toLocaleString('en-US')}` : '—'}
            {custom > 0 && <span className="font-normal text-gray-500"> + {custom} custom</span>}
          </p>
          <p className="text-[11px] text-gray-500">estimate, {shown.length} sign{shown.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-gray-100">
        {shown.map((id, index) => {
          const sign = byId.get(id)!;
          return (
            <li key={`${id}-${index}`} className="flex items-center gap-3 py-2">
              <SignThumbnail renderKey={sign.render_key} imagePath={sign.image_path} label={sign.name} className="h-8 w-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{sign.name}</p>
                <p className="text-xs text-gray-500">
                  {sign.est_price === null ? 'Custom quote' : `$${Number(sign.est_price).toLocaleString('en-US')} est.`}
                </p>
              </div>
              {editing && (
                <div className="flex items-center gap-2 text-xs">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${sign.name} up`} className="text-gray-500 disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={index === shown.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${sign.name} down`} className="text-gray-500 disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" onClick={() => setItems((c) => c.filter((_, i) => i !== index))} className="text-rose-700 underline-offset-2 hover:underline">
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-2 text-sm text-gray-500">No signs in this package.</li>}
      </ul>

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={`${input} min-w-0 flex-1`} value={adding} aria-label="Add a sign" onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add a sign…</option>
            {signs.map((sign) => (
              <option key={sign.id} value={sign.id}>
                {sign.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            onClick={() => {
              setItems((c) => [...c, adding]);
              setAdding('');
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {pending ? 'Saving…' : 'Save package'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setItems(saved);
                  setEditing(false);
                  setError(null);
                }}
                className="text-sm text-gray-600"
              >
                Cancel
              </button>
              <span className="text-xs text-gray-500">Applies to the next {formatLabel.toLowerCase()} store set up.</span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setItems(saved);
                setEditing(true);
              }}
              className="text-sm font-medium text-gray-800 underline-offset-2 hover:underline"
            >
              {pkg ? 'Edit package' : 'Create package'}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </article>
  );
}
