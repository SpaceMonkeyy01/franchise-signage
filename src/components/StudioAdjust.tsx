'use client';

// A franchisee adjusts a brand's Studio design for their store (SPEC v2.6 §8
// point 3): only what the brand admin left open, within its limits. Preview
// prices and renders it (~15 s, so on request); "Use this design" keeps it
// for the request, which is checked and priced again on submission.
// Going outside the limits is allowed — the sign then goes to corporate.

import { useState, useTransition } from 'react';

import { previewFranchiseeDesignAction, previewResubmitDesignAction } from '@/app/actions/studio';
import { downloadPreviewSheet } from '@/components/downloadSheet';
import { DEPTH, SIZE, label, ruleFor, type DesignRules, type SignDesign } from '@/lib/designs/design';
import { fileUrl } from '@/lib/storage/url';

export function hasAdjustableDesign(design: SignDesign | null, rules: DesignRules): design is SignDesign {
  return !!design && Object.values(rules).some((rule) => rule.mode !== 'locked');
}

export function StudioAdjust({
  brandSlug,
  locationId,
  brandItemId,
  base,
  rules,
  value,
  onChange,
  resubmit,
}: {
  brandSlug: string;
  locationId: string | null;
  brandItemId: string;
  /** Answering a change request from the request's link, not an account. */
  resubmit?: { token: string; lineItemId: string };
  base: SignDesign;
  rules: DesignRules;
  /** The adjusted design in use, or null for the brand's own. */
  value: SignDesign | null;
  onChange: (design: SignDesign | null) => void;
}) {
  const start = value ?? base;
  const [open, setOpen] = useState(false);
  const [inches, setInches] = useState(String(start.dimension.inches));
  const [depth, setDepth] = useState(start.depthInches === null ? '' : String(start.depthInches));
  const [options, setOptions] = useState(start.options);
  const [preview, setPreview] = useState<{ design: SignDesign; outside: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sizeRule = ruleFor(rules, SIZE);
  const depthRule = ruleFor(rules, DEPTH);
  const choiceOptions = Object.entries(rules).filter(
    (entry): entry is [string, { mode: 'choices'; values: string[] }] => entry[1].mode === 'choices',
  );

  const draft = (): SignDesign => ({
    ...base,
    options,
    dimension: { axis: base.dimension.axis, inches: Number(inches) },
    depthInches: depth.trim() ? Number(depth) : null,
  });

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-studio-adjust={brandItemId}>
        {value ? (
          <>
            <span className="text-gray-700">
              Customized: {value.dimension.inches}&quot; {value.dimension.axis}
              {value.price ? ` · $${value.price.toLocaleString('en-US')}` : ''}
            </span>
            <button type="button" onClick={() => setOpen(true)} className="font-medium text-gray-900 underline-offset-2 hover:underline">
              Change
            </button>
            <button type="button" onClick={() => onChange(null)} className="text-gray-500 underline-offset-2 hover:underline">
              Use the brand&apos;s design
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: 'var(--color-brand-dark)' }}
          >
            Customize in Studio
          </button>
        )}
      </div>
    );
  }

  const shown = preview?.design ?? value ?? base;
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" data-studio-adjust={brandItemId}>
      <div className="flex gap-3">
        {shown.mockupPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(shown.mockupPath)} alt="Sign preview" className="h-24 w-24 shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1 space-y-2 text-xs text-gray-700">
          {sizeRule.mode === 'range' && (
            <label className="block">
              {base.dimension.axis === 'height' ? 'Height' : 'Width'} (inches) — {sizeRule.min}–{sizeRule.max} without review
              <input
                value={inches}
                onChange={(e) => setInches(e.target.value)}
                inputMode="decimal"
                aria-label={`${base.dimension.axis === 'height' ? 'Height' : 'Width'} in inches`}
                className="mt-0.5 block w-24 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          )}
          {depthRule.mode === 'range' && (
            <label className="block">
              Depth (inches) — {depthRule.min}–{depthRule.max}
              <input
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                inputMode="decimal"
                className="mt-0.5 block w-24 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          )}
          {choiceOptions.map(([name, rule]) => (
            <label key={name} className="block">
              {label(name)}
              <select
                value={options[name]}
                onChange={(e) => setOptions((all) => ({ ...all, [name]: e.target.value }))}
                className="mt-0.5 block rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                {rule.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {preview && (
        <div className="mt-2 text-xs">
          <span className="text-sm font-semibold text-gray-900">
            {preview.design.price == null ? 'Custom quote' : `$${preview.design.price.toLocaleString('en-US')}`}
          </span>
          {preview.design.widthInches && preview.design.heightInches && (
            <span className="text-gray-500">
              {' '}
              · {preview.design.widthInches}&quot; × {preview.design.heightInches}&quot;
            </span>
          )}
          {preview.outside.length > 0 && (
            <p className="mt-1 text-amber-800">
              Outside the brand&apos;s limits — corporate will review this sign. {preview.outside.join(' ')}
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = resubmit
                ? await previewResubmitDesignAction(resubmit.token, resubmit.lineItemId, draft())
                : await previewFranchiseeDesignAction(brandSlug, locationId, brandItemId, draft());
              if ('error' in result) setError(result.error);
              else setPreview(result);
            });
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-800 disabled:opacity-50"
        >
          {pending ? (base.price == null ? 'Drawing…' : 'Pricing… (about 15 s)') : 'Preview'}
        </button>
        <button
          type="button"
          disabled={pending || !preview}
          onClick={() => {
            if (preview) onChange(preview.design);
            setOpen(false);
          }}
          className="rounded-lg px-3 py-1.5 font-medium text-white disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          Use this design
        </button>
        {preview && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const failed = await downloadPreviewSheet({
                  brandSlug,
                  as: 'franchisee',
                  locationId,
                  resubmit,
                  brandItemId,
                  design: draft(),
                });
                if (failed) setError(failed);
              })
            }
            className="font-medium text-gray-700 underline-offset-2 hover:underline disabled:opacity-40"
          >
            Download quote sheet (PDF)
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
