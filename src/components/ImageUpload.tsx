'use client';

// Upload, replace or remove a sign picture (DECISIONS #157).
//
// The thumbnail itself is the control: hover or focus shows a camera, a click
// opens the file picker, and a picture can be dropped straight onto it. The
// chosen file previews at once while it uploads. A small "+" marks a thumbnail
// with no picture of its own; a corner × removes one that has.
//
// The action is handed in, so the team's console and a brand's Signs tab share
// the control while each keeps its own authorization. No file means "remove".

import { useEffect, useRef, useState, useTransition } from 'react';

import type { SubmitFailure } from '@/lib/forms';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 9.55 3.5h4.9a1.5 1.5 0 0 1 1.25.7L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"
      />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function ImageUpload({
  hasImage,
  save,
  label = 'picture',
  children,
}: {
  /** Whether it has a picture of its own (not a fallback) — what Remove removes. */
  hasImage: boolean;
  save: (formData: FormData | null) => Promise<SubmitFailure | undefined>;
  /** What it is called: "picture", "icon". */
  label?: string;
  /** The thumbnail as it shows now. */
  children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  // The object URL lives only while the upload is in flight.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function run(formData: FormData | null) {
    setError(null);
    startTransition(async () => {
      const result = await save(formData);
      if (result?.error) setError(result.error);
      setPreview(null);
    });
  }

  function upload(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setError('Upload a PNG, JPG or WEBP picture.');
      return;
    }
    setPreview(URL.createObjectURL(file));
    const formData = new FormData();
    formData.set('file', file);
    run(formData);
  }

  const action = hasImage ? `Replace ${label}` : `Upload ${label}`;

  return (
    <span className="inline-flex shrink-0 flex-col items-start gap-1">
      <span
        className={`group relative inline-block rounded-md ${dragging ? 'ring-2 ring-[var(--color-brand,#111827)] ring-offset-1' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload(event.dataTransfer.files?.[0]);
        }}
      >
        {children}

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="absolute inset-0 h-full w-full rounded-md bg-white object-contain" />
        )}

        <input
          ref={input}
          type="file"
          accept={ACCEPT.join(',')}
          className="hidden"
          aria-label={action}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            upload(file);
          }}
        />

        {/* The whole thumbnail is the button. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          aria-label={action}
          title={`${action} — or drop one here`}
          className={`absolute inset-0 flex items-center justify-center rounded-md text-white transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gray-900 ${
            pending ? 'bg-black/40 opacity-100' : 'bg-black/45 opacity-0 group-hover:opacity-100'
          }`}
        >
          {pending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : (
            <CameraIcon className="h-5 w-5 drop-shadow" />
          )}
        </button>

        {/* No picture of its own yet: say it can have one. */}
        {!hasImage && !pending && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold leading-none text-white ring-2 ring-white group-hover:opacity-0"
          >
            +
          </span>
        )}

        {hasImage && !pending && (
          <button
            type="button"
            onClick={() => run(null)}
            aria-label="Remove"
            title={`Remove ${label}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs leading-none text-gray-500 opacity-0 shadow ring-1 ring-gray-200 transition-opacity hover:text-rose-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            ×
          </button>
        )}
      </span>
      {error && <span className="max-w-[12rem] text-[11px] leading-snug text-rose-700">{error}</span>}
    </span>
  );
}
