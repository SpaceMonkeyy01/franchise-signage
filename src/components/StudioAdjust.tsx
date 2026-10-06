'use client';

// A franchisee adjusts a brand's Studio design for their store (SPEC v2.6 §8
// point 3): only what the brand admin left open, within its limits. It opens
// as the Studio — a full window with the sign large, what may change beside
// it, and the price — rather than a few fields under the sign. Preview prices
// and renders it (~15 s, so on request); "Use this design" keeps it for the
// request, which is checked and priced again on submission. Going outside the
// limits is allowed — the sign then goes to corporate.

import { useEffect, useState, useTransition } from 'react';

import { previewFranchiseeDesignAction, previewResubmitDesignAction } from '@/app/actions/studio';
import { downloadPreviewSheet } from '@/components/downloadSheet';
import { DEPTH, SIZE, label, ruleFor, type DesignRules, type SignDesign } from '@/lib/designs/design';
import { fileUrl } from '@/lib/storage/url';

export function hasAdjustableDesign(design: SignDesign | null, rules: DesignRules): design is SignDesign {
  return !!design && Object.values(rules).some((rule) => rule.mode !== 'locked');
}

const money = (value: number | null | undefined) =>
  value == null ? 'Custom quote' : `$${Math.round(value).toLocaleString('en-US')}`;

export function StudioAdjust({
  brandSlug,
  locationId,
  brandItemId,
  signName,
  base,
  rules,
  value,
  onChange,
  resubmit,
}: {
  brandSlug: string;
  locationId: string | null;
  brandItemId: string;
  /** The sign, as the Studio window's title names it. */
  signName?: string;
  /** Answering a change request from the request's link, not an account. */
  resubmit?: { token: string; lineItemId: string };
  base: SignDesign;
  rules: DesignRules;
  /** The adjusted design in use, or null for the brand's own. */
  value: SignDesign | null;
  onChange: (design: SignDesign | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
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
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-semibold transition-colors hover:bg-white"
            style={{ color: 'var(--color-brand-dark)', borderColor: 'var(--color-brand-light)' }}
          >
            <PaletteIcon /> Customize in Studio
          </button>
        )}
      </div>
      {open && (
        <StudioWindow
          brandSlug={brandSlug}
          locationId={locationId}
          brandItemId={brandItemId}
          signName={signName}
          base={base}
          rules={rules}
          value={value}
          resubmit={resubmit}
          onClose={() => setOpen(false)}
          onUse={(design) => {
            onChange(design);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function StudioWindow({
  brandSlug,
  locationId,
  brandItemId,
  signName,
  base,
  rules,
  value,
  resubmit,
  onClose,
  onUse,
}: {
  brandSlug: string;
  locationId: string | null;
  brandItemId: string;
  signName?: string;
  base: SignDesign;
  rules: DesignRules;
  value: SignDesign | null;
  resubmit?: { token: string; lineItemId: string };
  onClose: () => void;
  onUse: (design: SignDesign) => void;
}) {
  const start = value ?? base;
  const [inches, setInches] = useState(String(start.dimension.inches));
  const [depth, setDepth] = useState(start.depthInches === null ? '' : String(start.depthInches));
  const [options, setOptions] = useState(start.options);
  const [preview, setPreview] = useState<{ design: SignDesign; outside: string[] } | null>(
    value ? { design: value, outside: [] } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sizeRule = ruleFor(rules, SIZE);
  const depthRule = ruleFor(rules, DEPTH);
  const choiceOptions = Object.entries(rules).filter(
    (entry): entry is [string, { mode: 'choices'; values: string[] }] => entry[1].mode === 'choices',
  );
  const locked = Object.entries(base.options).filter(([name]) => ruleFor(rules, name).mode === 'locked');
  const axisLabel = base.dimension.axis === 'height' ? 'Height' : 'Width';

  const draft = (): SignDesign => ({
    ...base,
    options,
    dimension: { axis: base.dimension.axis, inches: Number(inches) },
    depthInches: depth.trim() ? Number(depth) : null,
  });

  // The preview on screen matches the settings only until one of them changes.
  const shown = preview?.design ?? base;
  const current =
    String(shown.dimension.inches) === inches.trim() &&
    String(shown.depthInches ?? '') === depth.trim() &&
    Object.entries(options).every(([name, v]) => shown.options[name] === v);
  const outside = current ? (preview?.outside ?? []) : [];
  const changedFromBrand =
    Number(inches) !== base.dimension.inches ||
    (depth.trim() ? Number(depth) : null) !== base.depthInches ||
    Object.entries(options).some(([name, v]) => base.options[name] !== v);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const result = resubmit
        ? await previewResubmitDesignAction(resubmit.token, resubmit.lineItemId, draft())
        : await previewFranchiseeDesignAction(brandSlug, locationId, brandItemId, draft());
      if ('error' in result) setError(result.error);
      else setPreview(result);
    });
  }

  const sizeValue = Number(inches);
  const inRange = sizeRule.mode === 'range' && sizeValue >= sizeRule.min && sizeValue <= sizeRule.max;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-gray-900/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Design Studio — ${signName ?? 'sign'}`} data-studio-window={brandItemId}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-brand)' }}>
              Design Studio
            </p>
            <h2 className="truncate text-base font-semibold text-gray-900">{signName ?? 'Customize this sign'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close the Studio" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* The sign */}
          <div className="bg-gray-50 p-4 sm:p-5">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
              {shown.mockupPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(shown.mockupPath)}
                  alt={`${signName ?? 'Sign'} preview`}
                  className={`aspect-[4/3] w-full object-cover transition-opacity ${pending ? 'opacity-40' : current ? '' : 'opacity-60'}`}
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center text-sm text-gray-500">No preview yet</div>
              )}
              {pending && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-gray-800 shadow">
                    Drawing and pricing… about 15 seconds
                  </span>
                </div>
              )}
              {!pending && !current && (
                <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm">
                  Changed — update the preview
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                <dt className="text-[11px] text-gray-500">{axisLabel}</dt>
                <dd className="font-medium text-gray-900">{shown.dimension.inches}&quot;</dd>
              </div>
              {shown.widthInches && shown.heightInches ? (
                <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                  <dt className="text-[11px] text-gray-500">Overall size</dt>
                  <dd className="font-medium text-gray-900">
                    {shown.widthInches}&quot; × {shown.heightInches}&quot;
                  </dd>
                </div>
              ) : null}
              {shown.turnaroundDays ? (
                <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-gray-200">
                  <dt className="text-[11px] text-gray-500">Made in about</dt>
                  <dd className="font-medium text-gray-900">{shown.turnaroundDays} days</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {/* What may change */}
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            {sizeRule.mode === 'range' ? (
              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{axisLabel}</h3>
                  <span className="text-xs text-gray-500">
                    {sizeRule.min}–{sizeRule.max}&quot; allowed
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={sizeRule.min}
                    max={sizeRule.max}
                    step={0.5}
                    value={inRange ? sizeValue : base.dimension.inches}
                    onChange={(event) => setInches(event.target.value)}
                    aria-label={`${axisLabel} slider`}
                    className="flex-1"
                    style={{ accentColor: 'var(--color-brand)' }}
                  />
                  <label className="flex items-center gap-1 text-sm text-gray-700">
                    <input
                      value={inches}
                      onChange={(event) => setInches(event.target.value)}
                      inputMode="decimal"
                      aria-label={`${axisLabel} in inches`}
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm"
                    />
                    in
                  </label>
                </div>
              </section>
            ) : (
              <p className="text-sm text-gray-600">
                {axisLabel}: <span className="font-medium text-gray-900">{base.dimension.inches}&quot;</span>{' '}
                <span className="text-xs text-gray-500">(set by the brand)</span>
              </p>
            )}

            {depthRule.mode === 'range' && (
              <section>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Depth</h3>
                  <span className="text-xs text-gray-500">
                    {depthRule.min}–{depthRule.max}&quot; allowed
                  </span>
                </div>
                <input
                  value={depth}
                  onChange={(event) => setDepth(event.target.value)}
                  inputMode="decimal"
                  aria-label="Depth in inches"
                  className="mt-2 w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </section>
            )}

            {choiceOptions.map(([name, rule]) => (
              <section key={name}>
                <h3 className="text-sm font-semibold text-gray-900">{label(name)}</h3>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label(name)}>
                  {rule.values.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={options[name] === choice}
                      onClick={() => setOptions((all) => ({ ...all, [name]: choice }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        options[name] === choice ? 'font-semibold' : 'border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                      style={
                        options[name] === choice
                          ? { borderColor: 'var(--color-brand)', background: 'var(--color-brand-light)', color: 'var(--color-brand-dark)' }
                          : undefined
                      }
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-xl bg-gray-50 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Set by the brand</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="flex items-center justify-between gap-3">
                  <span className="text-gray-600">Logo</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(base.logo.path)} alt="Brand logo" className="h-6 max-w-28 object-contain" />
                </li>
                {locked.map(([name, v]) => (
                  <li key={name} className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">{label(name)}</span>
                    <span className="text-right font-medium text-gray-900">{v}</span>
                  </li>
                ))}
              </ul>
            </section>

            {outside.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Outside the brand&apos;s limits, so the brand reviews this sign before it is ordered. {outside.join(' ')}
              </p>
            )}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-3">
          <div>
            <p className="text-[11px] text-gray-500">{current ? 'Price' : 'Price for the preview shown'}</p>
            <p className="text-xl font-semibold text-gray-900" data-studio-price>
              {money(shown.price)}
              {shown !== base && shown.price != null && base.price != null && Math.round(shown.price) !== Math.round(base.price) && (
                <span className={`ml-2 text-xs font-medium ${shown.price > base.price ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {shown.price > base.price ? '+' : '−'}${Math.abs(Math.round(shown.price - base.price)).toLocaleString('en-US')} vs the brand&apos;s design
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {preview && current && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const failed = await downloadPreviewSheet({ brandSlug, as: 'franchisee', locationId, resubmit, brandItemId, design: draft() });
                    if (failed) setError(failed);
                  })
                }
                className="px-2 text-sm font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
              >
                Quote sheet (PDF)
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || (current && !!preview)}
              onClick={runPreview}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-gray-400 disabled:opacity-40"
            >
              {pending ? 'Updating…' : 'Update preview'}
            </button>
            <button
              type="button"
              disabled={pending || !preview || !current || !changedFromBrand}
              onClick={() => preview && onUse(preview.design)}
              title={!changedFromBrand ? 'Nothing changed from the brand’s design' : !current || !preview ? 'Update the preview first' : undefined}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--color-brand)' }}
            >
              Use this design
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 2.5a7.5 7.5 0 100 15c1 0 1.5-.6 1.5-1.4 0-1-.9-1.4-.9-2.3 0-.8.7-1.3 1.5-1.3h1.6a3.8 3.8 0 003.8-3.8C17.5 5.3 14.1 2.5 10 2.5z" />
      <circle cx="6.5" cy="9" r="1" />
      <circle cx="9" cy="6" r="1" />
      <circle cx="12.5" cy="6.5" r="1" />
    </svg>
  );
}
