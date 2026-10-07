'use client';

// "Complete your package" (DECISIONS #186): what the readiness card says is
// still open, each with its own way to add it. A photo saves the moment it is
// uploaded; a size or the landlord details save with their own button. The
// page refreshes after each, so the readiness card and this list shrink as
// the franchisee works down it.
//
// Each group folds to one line ("Site photos · 11 to add"), so a long package
// does not make this panel longer than the page beside it (DECISIONS #195).
// A group with two rows or fewer starts open; there is nothing to fold.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { PhotoUpload } from '@/components/PhotoUpload';
import type { StoredObject } from '@/lib/storage';

import { addLeaseExhibitAction, addSitePhotoAction, setSignSizeAction } from './actions';

export interface OpenItem {
  id: string;
  name: string;
  needsPhoto: boolean;
  needsSize: boolean;
  sizing: string | null;
}

export function CompletePackage({
  token,
  brandSlug,
  photoLabel,
  items,
  needsLease,
  location,
}: {
  token: string;
  brandSlug: string;
  /** "Site photo", or "Condition photo" on a replacement. */
  photoLabel: string;
  items: OpenItem[];
  needsLease: boolean;
  /** Location details still to confirm, and where they are edited. */
  location: { missing: string; editHref: string } | null;
}) {
  const photos = items.filter((item) => item.needsPhoto);
  const sizes = items.filter((item) => item.needsSize);
  const open = photos.length + sizes.length + (needsLease ? 1 : 0) + (location ? 1 : 0);
  if (open === 0) return null;

  return (
    <section className="mt-5 rounded-xl border border-amber-200 bg-white p-4 shadow-sm" data-testid="complete-package">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Complete your package</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
          {open} to add
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Add what you have now; Signage.com sees it straight away. Anything you leave, the team follows up.
      </p>

      <div className="mt-3 space-y-2">
        {photos.length > 0 && (
          <Group title={`${photoLabel}s`} count={photos.length}>
            {photos.map((item) => (
              <PhotoRow key={item.id} token={token} brandSlug={brandSlug} item={item} photoLabel={photoLabel} />
            ))}
          </Group>
        )}

        {sizes.length > 0 && (
          <Group title="Sizes" count={sizes.length}>
            {sizes.map((item) => (
              <SizeRow key={item.id} token={token} item={item} />
            ))}
          </Group>
        )}

        {needsLease && (
          <Group title="Landlord sign criteria" count={1} status="Not added" startOpen={false}>
            <LeaseForm token={token} brandSlug={brandSlug} />
          </Group>
        )}

        {location && (
          <Group title="Location details" count={1}>
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
              <span>{location.missing}</span>
              <Link href={location.editHref} className="text-xs font-semibold underline underline-offset-2" style={{ color: 'var(--color-brand-dark)' }}>
                Edit store details
              </Link>
            </p>
          </Group>
        )}
      </div>
    </section>
  );
}

function Group({
  title,
  count,
  status,
  startOpen,
  children,
}: {
  title: string;
  count: number;
  /** The line shown while folded; "N to add" when not given. */
  status?: string;
  startOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={startOpen ?? count <= 2} className="group rounded-lg border border-gray-200">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <span className="flex items-center gap-2 text-xs text-amber-800">
          {status ?? `${count} to add`}
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <ul className="divide-y divide-gray-100 border-t border-gray-100">{children}</ul>
    </details>
  );
}

function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function save(work: () => Promise<{ error: string } | undefined>, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result?.error) setError(result.error);
      else {
        done?.();
        router.refresh();
      }
    });
  }
  return { error, pending, save };
}

function PhotoRow({ token, brandSlug, item, photoLabel }: { token: string; brandSlug: string; item: OpenItem; photoLabel: string }) {
  const { error, pending, save } = useSave();
  const [file, setFile] = useState<StoredObject | null>(null);
  return (
    <li className="px-3 py-2" data-complete-photo={item.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-gray-800">{item.name}</span>
        {pending ? (
          <span className="text-xs text-gray-500">Saving…</span>
        ) : (
          <PhotoUpload
            compact
            label={`Add ${photoLabel.toLowerCase()}`}
            prefix={brandSlug}
            token={token}
            value={file}
            onChange={(next) => {
              setFile(next);
              if (next) save(() => addSitePhotoAction(token, item.id, next));
            }}
          />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function SizeRow({ token, item }: { token: string; item: OpenItem }) {
  const { error, pending, save } = useSave();
  const [value, setValue] = useState(item.sizing ?? '');
  return (
    <li className="px-3 py-2" data-complete-size={item.name}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save(() => setSignSizeAction(token, item.id, value));
        }}
      >
        <span className="min-w-32 flex-1 text-sm text-gray-800">{item.name}</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={'e.g. 30" high, 8 ft wide'}
          aria-label={`Size of ${item.name}`}
          className="w-44 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

function LeaseForm({ token, brandSlug }: { token: string; brandSlug: string }) {
  const { error, pending, save } = useSave();
  const [file, setFile] = useState<StoredObject | null>(null);
  const [landlord, setLandlord] = useState({ name: '', email: '', phone: '' });
  const field = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';
  return (
    <li className="space-y-2 px-3 py-3">
      <p className="text-xs text-gray-500">
        Most leases include a sign exhibit setting what the landlord allows. Signage.com checks your signs against it.
      </p>
      <PhotoUpload label="Upload the lease sign exhibit (PDF or photo)" prefix={brandSlug} token={token} value={file} onChange={setFile} />
      <div className="grid grid-cols-1 gap-2">
        <input className={field} placeholder="Property manager" aria-label="Property manager" value={landlord.name} onChange={(e) => setLandlord({ ...landlord, name: e.target.value })} />
        <input className={field} placeholder="Their email" aria-label="Property manager email" type="email" value={landlord.email} onChange={(e) => setLandlord({ ...landlord, email: e.target.value })} />
        <input className={field} placeholder="Their phone" aria-label="Property manager phone" value={landlord.phone} onChange={(e) => setLandlord({ ...landlord, phone: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending || (!file && !landlord.name.trim() && !landlord.email.trim() && !landlord.phone.trim())}
          onClick={() => save(() => addLeaseExhibitAction(token, file, landlord))}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save landlord details'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </li>
  );
}
