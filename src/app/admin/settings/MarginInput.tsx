'use client';

import { useState, useTransition } from 'react';

import { setMarginAction } from './actions';

/**
 * One margin, edited in place. Empty means "use the default beneath", shown as
 * the placeholder, so the team sees what applies without setting anything.
 */
export function MarginInput({
  brandId,
  signType,
  percent,
  inherited,
  label,
}: {
  brandId: string | null;
  signType: string | null;
  percent: number | null;
  /** What applies when this is empty; null for the standard margin, which is never empty. */
  inherited: number | null;
  label: string;
}) {
  const saved = percent === null ? '' : String(percent);
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== saved;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setMarginAction(brandId, signType, value);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) save();
          }}
          inputMode="decimal"
          aria-label={label}
          placeholder={inherited === null ? '' : `${inherited}`}
          className={`w-16 rounded-lg border px-2 py-1 text-right text-sm ${
            percent === null ? 'border-gray-200 text-gray-500' : 'border-gray-300 text-gray-900'
          }`}
        />
        <span className="text-sm text-gray-500">%</span>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          className="w-10 text-xs font-medium text-gray-900 underline-offset-2 hover:underline disabled:invisible"
        >
          {pending ? '…' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
