'use client';

import { useState, useTransition } from 'react';

import { PhotoUpload } from '@/components/PhotoUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, VendorChip } from '@/components/StatusChip';
import type { BrandPublic, InstalledSignRow } from '@/lib/db/queries';
import type { ReplaceReason } from '@/lib/status/types';
import type { StoredObject } from '@/lib/storage';

import { submitReplacement } from './actions';

const REASONS: Array<{ id: ReplaceReason; label: string }> = [
  { id: 'damaged', label: 'Damaged' },
  { id: 'worn', label: 'Faded / worn' },
  { id: 'vandalized', label: 'Vandalized' },
];

export function ReplaceForm({
  brand,
  locationId,
  installed,
}: {
  brand: BrandPublic;
  locationId: string;
  installed: InstalledSignRow[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState<ReplaceReason | null>(null);
  const [photo, setPhoto] = useState<StoredObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = installed.find((sign) => sign.id === selectedId) ?? null;
  const policy = selected?.vendor_policy_override ?? brand.vendor_policy;
  const external = policy !== 'signage_com';

  function submit() {
    if (!selected || !reason) return;
    setError(null);
    startTransition(async () => {
      // A returned value means it did not submit; success redirects.
      const failure = await submitReplacement({
        brandSlug: brand.slug,
        locationId,
        installedSignId: selected.id,
        reason,
        photo,
      });
      if (failure) setError(failure.error);
    });
  }

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-xs font-medium text-gray-700">1 · Which sign needs replacing?</h2>
      <div className="space-y-2">
        {installed.map((sign) => {
          const active = sign.id === selectedId;
          return (
            <button
              key={sign.id}
              type="button"
              onClick={() => setSelectedId(sign.id)}
              className={`flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2.5 text-left transition-colors ${
                active ? '' : 'border-gray-200 hover:border-gray-300'
              }`}
              style={
                active
                  ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 1px var(--color-brand)' }
                  : undefined
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                <SignThumbnail
                  renderKey={sign.render_key}
                  label={sign.brand_item_name}
                  className="h-11 w-16 shrink-0 rounded-md"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {sign.brand_item_name}
                  </span>
                  <span className="block truncate text-xs text-gray-400">
                    {sign.sizing ?? 'Sizing on file'} · installed{' '}
                    {new Date(sign.installed_at).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </span>
              </span>
              {active && (
                <span className="ml-2 shrink-0" style={{ color: 'var(--color-brand)' }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          <h2 className="mb-2 mt-5 text-xs font-medium text-gray-700">2 · What happened to it?</h2>
          <div className="grid grid-cols-3 gap-2">
            {REASONS.map((option) => {
              const active = option.id === reason;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setReason(option.id)}
                  className={`rounded-lg border bg-white py-2 text-sm transition-colors ${
                    active ? 'font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  style={
                    active
                      ? {
                          borderColor: 'var(--color-brand)',
                          background: 'var(--color-brand-light)',
                          color: 'var(--color-brand-dark)',
                        }
                      : undefined
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <PhotoUpload
              label="Optional: photo of current condition"
              prefix={brand.slug}
              value={photo}
              onChange={setPhoto}
            />
          </div>
        </>
      )}

      {selected && reason && (
        <div
          className="mt-4 rounded-xl border p-4"
          style={{
            borderColor: 'var(--color-brand)',
            background: 'var(--color-brand-light)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-brand-dark)' }}>
            Ready to submit — pre-approved
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-brand-dark)' }}>
            Replacing your {selected.brand_item_name}
            {selected.sizing ? ` (${selected.sizing})` : ''} like-for-like against the locked brand
            spec{selected.spec_summary ? `: ${selected.spec_summary}` : ''}. Skips corporate review,
            straight to quote preparation.
          </p>
          <p
            className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold"
            style={{ color: 'var(--color-brand-dark)' }}
          >
            {external ? (
              <>
                Will be sent to {brand.vendor_name ?? 'your brand’s vendor'} for pricing per{' '}
                {brand.name} vendor policy
                {selected.est_price &&
                  ` · Signage.com reference estimate ${formatPrice(selected.est_price)}`}
              </>
            ) : (
              <>
                Estimated: {formatPrice(selected.est_price)}
                {brand.default_tat && ` · TAT ${brand.default_tat}`}
              </>
            )}
            <VendorChip policy={policy} vendorName={brand.vendor_name} brandPolicy={brand.vendor_policy} />
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!selected || !reason || pending}
        className="mt-4 w-full rounded-lg py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--color-brand)' }}
      >
        {pending ? 'Submitting…' : 'Submit replacement request →'}
      </button>
    </div>
  );
}
