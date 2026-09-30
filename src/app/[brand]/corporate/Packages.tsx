'use client';

// Standard packages, per store type (SPEC v2.4 §2.3).
//
// A package is what a new store of that type starts with: the checklist a
// franchisee sees at setup, the signs that auto-approve (SPEC §7), and the
// number on the budget one-pager. A brand admin edits it here and it is live
// at once for the next store set up; requests already made are untouched.
// Only live signs can be added. Reviewers read.

import { useState, useTransition } from 'react';

import { SignThumbnail } from '@/components/SignThumbnail';
import type { ManagedPackage, ManagedSign, PackageFormat } from '@/lib/catalog/manage';

import { savePackageAction } from './catalog-actions';

const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';

export function Packages({
  brandSlug,
  canManage,
  formats,
  packages,
  signs,
}: {
  brandSlug: string;
  canManage: boolean;
  /** Every store type, with its label, whether or not it has a package yet. */
  formats: { format: PackageFormat; label: string }[];
  packages: ManagedPackage[];
  /** Live signs: the only ones a package can hold. */
  signs: ManagedSign[];
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-gray-900">Standard packages</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
        What a new store of each type starts with. These signs are pre-loaded at setup and approved automatically;
        anything else a franchisee adds comes to you for approval. Changes apply to the next store set up.
      </p>
      <div className="mt-3 space-y-3">
        {formats.map(({ format, label }) => (
          <PackageCard
            key={format}
            brandSlug={brandSlug}
            canManage={canManage}
            format={format}
            formatLabel={label}
            pkg={packages.find((p) => p.format === format) ?? null}
            signs={signs}
          />
        ))}
      </div>
    </section>
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
  format,
  formatLabel,
  pkg,
  signs,
}: {
  brandSlug: string;
  canManage: boolean;
  format: PackageFormat;
  formatLabel: string;
  pkg: ManagedPackage | null;
  signs: ManagedSign[];
}) {
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
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{formatLabel} stores</p>
          {editing ? (
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
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
          <p className="text-[11px] text-gray-400">estimate, {shown.length} sign{shown.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-gray-100">
        {shown.map((id, index) => {
          const sign = byId.get(id)!;
          return (
            <li key={`${id}-${index}`} className="flex items-center gap-3 py-2">
              <SignThumbnail renderKey={sign.render_key} label={sign.name} className="h-8 w-11 shrink-0" />
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
              <span className="text-xs text-gray-400">Applies to the next {formatLabel.toLowerCase()} store set up.</span>
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
