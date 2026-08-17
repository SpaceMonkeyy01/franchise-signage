'use client';

// The upload control every franchisee screen uses.
//
// Uploads immediately on pick rather than at submit, so the file is in storage
// before the form is finished and a slow phone upload never sits between the
// franchisee and the Submit button (docs/flow-demo.jsx simulates this with a
// click; this is the real thing).

import { useRef, useState, useTransition } from 'react';

import { uploadPhoto } from '@/app/actions/upload';
import type { StoredObject } from '@/lib/storage';

export function PhotoUpload({
  label,
  prefix,
  value,
  onChange,
  accept = 'image/jpeg,image/png,image/webp,image/heic,application/pdf',
}: {
  label: string;
  /** Storage folder — the brand slug, so dev uploads are legible on disk. */
  prefix: string;
  value: StoredObject | null;
  onChange: (file: StoredObject | null) => void;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const data = new FormData();
    data.set('file', file);
    data.set('prefix', prefix);
    startTransition(async () => {
      const result = await uploadPhoto(data);
      if (result.ok) onChange(result.file);
      else setError(result.error);
    });
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => pick(event.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <CheckIcon />
          <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{value.fileName}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (input.current) input.current.value = '';
            }}
            className="text-[11px] text-gray-400 hover:text-gray-700"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-xs text-gray-500 transition-colors hover:border-gray-400 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : `↑ ${label}`}
        </button>
      )}

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="var(--color-brand)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 8.5 3.5 3.5L13 5" />
    </svg>
  );
}
