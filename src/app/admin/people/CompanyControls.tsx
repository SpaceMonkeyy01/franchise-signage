'use client';

// A company's row actions on People → Companies (DECISIONS #200).

import { useState, useTransition } from 'react';

import { renameCompanyAction, setCompanyActiveAction } from './actions';

export function CompanyControls({
  franchiseeId,
  name,
  active,
  people,
}: {
  franchiseeId: string;
  name: string;
  active: boolean;
  /** How many accounts lose access, for the confirmation. */
  people: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ error: string } | undefined>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const failure = await work();
      if (failure) setError(failure.error);
      else done?.();
    });
  };

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => renameCompanyAction(franchiseeId, value),
            () => setEditing(false),
          );
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Company name"
          className="w-48 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          autoFocus
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(name);
          }}
          className="text-xs text-gray-600 hover:underline"
        >
          Cancel
        </button>
        {error && <span className="w-full text-right text-xs text-rose-700">{error}</span>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-gray-600 underline-offset-2 hover:underline"
      >
        Rename
      </button>
      {active ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                `Deactivate ${name}? ${people === 1 ? 'Its one account loses' : `All ${people} of its accounts lose`} access on their next click. Its stores and their sign records stay.`,
              )
            )
              return;
            run(() => setCompanyActiveAction(franchiseeId, false));
          }}
          className="text-xs text-gray-500 underline-offset-2 hover:text-rose-700 hover:underline disabled:opacity-40"
        >
          {pending ? '…' : 'Deactivate'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setCompanyActiveAction(franchiseeId, true))}
          className="text-xs font-medium text-gray-700 underline-offset-2 hover:underline disabled:opacity-40"
        >
          {pending ? '…' : 'Reactivate'}
        </button>
      )}
      {error && <span className="w-full text-right text-xs text-rose-700">{error}</span>}
    </div>
  );
}
