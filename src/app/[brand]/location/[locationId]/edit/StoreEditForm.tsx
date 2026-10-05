'use client';

// The store's details as a form (DECISIONS #177). The server decides what may
// change; this only shows the store type as locked when it is.

import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { StoreFields } from '@/lib/stores/changes';

import { updateStoreAction } from './actions';

const input = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';

export function StoreEditForm({
  brandSlug,
  locationId,
  initial,
  types,
  typeLocked,
  teamOverride,
}: {
  brandSlug: string;
  locationId: string;
  initial: StoreFields;
  types: { key: string; label: string }[];
  /** The store has an order and the editor is not Signage.com. */
  typeLocked: boolean;
  /** Signage.com changing the type of a store that already has an order. */
  teamOverride: boolean;
}) {
  const [fields, setFields] = useState(initial);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof StoreFields) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields({ ...fields, [key]: event.target.value });
  const typeLabel = types.find((type) => type.key === initial.format)?.label ?? initial.format;

  function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateStoreAction(brandSlug, locationId, fields);
      if ('error' in result) setMessage({ tone: 'error', text: result.error });
      else
        setMessage({
          tone: 'ok',
          text: result.saved === 0 ? 'Nothing to save: no changes.' : 'Saved.',
        });
    });
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <label className="block text-xs font-medium text-gray-700">
        Store name
        <input value={fields.name} onChange={set('name')} className={input} required />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Street address
        <input value={fields.line1} onChange={set('line1')} className={input} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-gray-700">
          City
          <input value={fields.city} onChange={set('city')} className={input} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          State
          <input value={fields.state} onChange={set('state')} className={input} />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          ZIP
          <input value={fields.zip} onChange={set('zip')} className={input} />
        </label>
      </div>
      <label className="block text-xs font-medium text-gray-700">
        Opening date
        <input type="date" value={fields.openingDate} onChange={set('openingDate')} className={`${input} sm:w-56`} />
      </label>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Store type
          {typeLocked ? (
            <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900">{typeLabel}</p>
          ) : (
            <select value={fields.format} onChange={set('format')} className={`${input} sm:w-56`}>
              {types.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          )}
        </label>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {typeLocked
            ? 'This store already has an order, so its type is fixed. The type decides which signs are standard and approved automatically. Contact Signage.com if it needs to change.'
            : teamOverride
              ? 'This store has orders. Changing its type affects future orders only; orders already placed keep their approvals.'
              : 'The store type decides which standard sign package loads when you choose your signs.'}
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.tone === 'error' ? 'text-rose-700' : 'text-green-800'}`}>{message.text}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        <Link href={`/${brandSlug}`} className="text-sm text-gray-600 hover:text-gray-900">
          Back to stores
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--color-brand)' }}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
