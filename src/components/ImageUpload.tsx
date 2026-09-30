'use client';

// Upload, replace or remove a sign picture (DECISIONS #157).
//
// The action is handed in, so the team's console and a brand's Signs tab share
// the control while each keeps its own authorization. No file means "remove".

import { useRef, useState, useTransition } from 'react';

import type { SubmitFailure } from '@/lib/forms';

export function ImageUpload({
  hasImage,
  save,
  label = 'picture',
}: {
  hasImage: boolean;
  save: (formData: FormData | null) => Promise<SubmitFailure | undefined>;
  /** What it is called in the buttons: "picture", "icon". */
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(formData: FormData | null) {
    setError(null);
    startTransition(async () => {
      const result = await save(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={`Upload ${label}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const formData = new FormData();
          formData.set('file', file);
          run(formData);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
      >
        {pending ? 'Uploading…' : hasImage ? `Replace ${label}` : `Upload ${label}`}
      </button>
      {hasImage && !pending && (
        <button
          type="button"
          onClick={() => run(null)}
          className="text-gray-400 underline-offset-2 hover:text-rose-700 hover:underline"
        >
          Remove
        </button>
      )}
      {error && <span className="text-rose-700">{error}</span>}
    </span>
  );
}
