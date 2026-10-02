'use client';

// The brand admin's Studio editor (SPEC v2.6 §8). Left: the design — logo,
// options, size — and what a franchisee may change. Right: the engine's
// mockup and Signage.com's price for it. Pricing takes ~15 s and is billed,
// so it runs when asked, not on every keystroke; Save prices again on the
// server whatever this page showed.

import { useMemo, useState, useTransition } from 'react';

import { DEPTH, SIZE, label, type DesignRule, type DesignRules, type SignDesign } from '@/lib/designs/design';
import { fileUrl } from '@/lib/storage/url';

import { previewDesignAction, saveDesignAction, uploadLogoAction, brandLogoAction } from '../actions';

type Options = Record<string, readonly { value: string; name?: string }[]>;

const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';

export function StudioEditor({
  brandSlug,
  itemId,
  hasBrandLogo,
  options,
  saved,
  savedRules,
  pinned,
}: {
  brandSlug: string;
  itemId: string;
  hasBrandLogo: boolean;
  options: Options;
  saved: SignDesign | null;
  savedRules: DesignRules;
  pinned: Record<string, unknown>;
}) {
  const initialOptions = useMemo(() => {
    const chosen: Record<string, string> = {};
    for (const [name, values] of Object.entries(options)) {
      const from = saved?.options[name] ?? (typeof pinned[name] === 'string' ? (pinned[name] as string) : undefined);
      chosen[name] = from && values.some((v) => v.value === from) ? from : values[0].value;
    }
    return chosen;
  }, [options, saved, pinned]);

  const [logo, setLogo] = useState<SignDesign['logo'] | null>(saved?.logo ?? null);
  const [chosen, setChosen] = useState(initialOptions);
  const [axis, setAxis] = useState<'height' | 'width'>(saved?.dimension.axis ?? 'height');
  const [inches, setInches] = useState(String(saved?.dimension.inches ?? 24));
  const [depth, setDepth] = useState(saved?.depthInches ? String(saved.depthInches) : '');
  // A first design starts with the size adjustable a quarter either way (defaultRules).
  const [rules, setRules] = useState<DesignRules>(
    saved ? savedRules : { [SIZE]: { mode: 'range', min: 18, max: 30 } },
  );
  const [preview, setPreview] = useState<SignDesign | null>(saved);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState<null | 'logo' | 'preview' | 'save'>(null);
  const [, startTransition] = useTransition();

  const design = (): SignDesign | null => {
    const size = Number(inches);
    if (!logo) {
      setMessage({ tone: 'error', text: 'Add the logo first.' });
      return null;
    }
    if (!Number.isFinite(size) || size <= 0) {
      setMessage({ tone: 'error', text: `Enter the sign's ${axis} in inches.` });
      return null;
    }
    const depthValue = depth.trim() ? Number(depth) : null;
    return { logo, options: chosen, dimension: { axis, inches: size }, depthInches: depthValue };
  };

  // A preview is only current while nothing it was made from has changed.
  const current =
    preview &&
    logo &&
    preview.logo.path === logo.path &&
    preview.dimension.axis === axis &&
    String(preview.dimension.inches) === inches.trim() &&
    String(preview.depthInches ?? '') === depth.trim() &&
    Object.entries(chosen).every(([name, value]) => preview.options[name] === value);

  function run(kind: 'logo' | 'preview' | 'save', fn: () => Promise<void>) {
    setMessage(null);
    setBusy(kind);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    run('logo', async () => {
      const result = await uploadLogoAction(brandSlug, form);
      if ('error' in result) setMessage({ tone: 'error', text: result.error });
      else setLogo(result.logo);
    });
  }

  function onPreview() {
    const next = design();
    if (!next) return;
    run('preview', async () => {
      const result = await previewDesignAction(brandSlug, itemId, next);
      if ('error' in result) setMessage({ tone: 'error', text: result.error });
      else setPreview(result.design);
    });
  }

  function onSave() {
    const next = design();
    if (!next) return;
    run('save', async () => {
      const result = await saveDesignAction(brandSlug, itemId, next, rules);
      if ('error' in result) setMessage({ tone: 'error', text: result.error });
      else {
        setPreview(result.design);
        setMessage({ tone: 'ok', text: 'Saved. Franchisees see this design and price from now on.' });
      }
    });
  }

  const setRule = (name: string, rule: DesignRule | null) =>
    setRules((all) => {
      const next = { ...all };
      if (rule) next[name] = rule;
      else delete next[name];
      return next;
    });

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        {/* Logo */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Logo</h2>
          <p className="text-xs text-gray-500">PNG, JPG or WEBP, up to 2 MB. Franchisees cannot change it.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(logo.path)} alt="Logo" className="h-12 max-w-40 rounded border border-gray-100 object-contain p-1" />
            )}
            <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400">
              {busy === 'logo' ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onLogo(e.target.files?.[0])}
              />
            </label>
            {!logo && hasBrandLogo && (
              <button
                type="button"
                onClick={() =>
                  run('logo', async () => {
                    const result = await brandLogoAction(brandSlug);
                    if ('error' in result) setMessage({ tone: 'error', text: result.error });
                    else setLogo(result.logo);
                  })
                }
                className="text-sm text-gray-700 underline-offset-2 hover:underline"
              >
                Use the brand logo
              </button>
            )}
          </div>
        </section>

        {/* Size */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Size</h2>
          <p className="text-xs text-gray-500">
            Give one dimension; the Studio works out the other from the logo&apos;s shape.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              Measure by
              <select value={axis} onChange={(e) => setAxis(e.target.value as 'height' | 'width')} className={`${input} mt-1 block`}>
                <option value="height">Height</option>
                <option value="width">Width</option>
              </select>
            </label>
            <label className="text-xs text-gray-600">
              {axis === 'height' ? 'Height' : 'Width'} (inches)
              <input value={inches} onChange={(e) => setInches(e.target.value)} inputMode="decimal" className={`${input} mt-1 block w-28`} />
            </label>
            <label className="text-xs text-gray-600">
              Depth (inches, optional)
              <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" placeholder="standard" className={`${input} mt-1 block w-28`} />
            </label>
          </div>
          <RangeRule
            title={`Franchisees may change the ${axis}`}
            rule={rules[SIZE]}
            current={Number(inches)}
            onChange={(rule) => setRule(SIZE, rule)}
          />
          {depth.trim() && (
            <RangeRule
              title="Franchisees may change the depth"
              rule={rules[DEPTH]}
              current={Number(depth)}
              onChange={(rule) => setRule(DEPTH, rule)}
            />
          )}
        </section>

        {/* Options */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Options</h2>
          <p className="text-xs text-gray-500">
            Locked unless you tick other choices a franchisee may pick instead.
          </p>
          <ul className="mt-2 divide-y divide-gray-100">
            {Object.entries(options).map(([name, values]) => {
              const rule = rules[name];
              const allowed = rule?.mode === 'choices' ? rule.values : [chosen[name]];
              return (
                <li key={name} className="py-3" data-option={name}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm text-gray-900">
                      {label(name)}
                      <select
                        value={chosen[name]}
                        onChange={(e) => {
                          const value = e.target.value;
                          setChosen((all) => ({ ...all, [name]: value }));
                          if (rule?.mode === 'choices' && !rule.values.includes(value)) {
                            setRule(name, { mode: 'choices', values: [value, ...rule.values] });
                          }
                        }}
                        className={`${input} ml-2`}
                      >
                        {values.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.name ?? v.value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="text-xs text-gray-500">
                      {rule?.mode === 'choices' ? `Franchisee picks from ${rule.values.length}` : 'Locked'}
                    </span>
                  </div>
                  {values.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {values.map((v) => (
                        <label key={v.value} className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={allowed.includes(v.value)}
                            disabled={v.value === chosen[name]}
                            onChange={(e) => {
                              const set = new Set(allowed);
                              if (e.target.checked) set.add(v.value);
                              else set.delete(v.value);
                              set.add(chosen[name]);
                              setRule(name, set.size > 1 ? { mode: 'choices', values: [...set] } : null);
                            }}
                          />
                          {v.name ?? v.value}
                        </label>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Preview and price</h2>
          <div className="mt-3 aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
            {busy === 'preview' || busy === 'save' ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                Rendering and pricing… this takes about 15 seconds.
              </div>
            ) : preview?.mockupPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(preview.mockupPath)} alt="Mockup" className={`h-full w-full object-cover ${current ? '' : 'opacity-40'}`} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                Preview to see the sign and its price.
              </div>
            )}
          </div>
          {preview?.price && (
            <div className={current ? '' : 'opacity-50'}>
              <p className="mt-3 text-2xl font-semibold text-gray-900" data-studio-price>
                ${preview.price.toLocaleString('en-US')}
              </p>
              <p className="text-xs text-gray-500">
                {[
                  preview.widthInches && preview.heightInches
                    ? `${preview.widthInches}" × ${preview.heightInches}"`
                    : null,
                  preview.turnaroundDays ? `${preview.turnaroundDays} days to make` : null,
                  'Signage.com price, shipping included',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {!current && <p className="mt-1 text-xs text-amber-700">You changed the design — preview again.</p>}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={onPreview}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-800 hover:border-gray-400 disabled:opacity-50"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={onSave}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}
            >
              Save design
            </button>
          </div>
          {message && (
            <p className={`mt-2 text-xs ${message.tone === 'error' ? 'text-rose-700' : 'text-green-800'}`}>{message.text}</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function RangeRule({
  title,
  rule,
  current,
  onChange,
}: {
  title: string;
  rule: DesignRule | undefined;
  current: number;
  onChange: (rule: DesignRule | null) => void;
}) {
  const on = rule?.mode === 'range';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked && Number.isFinite(current) && current > 0
                ? { mode: 'range', min: Math.round(current * 0.75 * 4) / 4, max: Math.round(current * 1.25 * 4) / 4 }
                : null,
            )
          }
        />
        {title}
      </label>
      {on && rule.mode === 'range' && (
        <>
          <span>from</span>
          <input
            value={rule.min}
            onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
            inputMode="decimal"
            className="w-16 rounded border border-gray-300 px-1.5 py-0.5"
            aria-label={`${title}: minimum`}
          />
          <span>to</span>
          <input
            value={rule.max}
            onChange={(e) => onChange({ ...rule, max: Number(e.target.value) })}
            inputMode="decimal"
            className="w-16 rounded border border-gray-300 px-1.5 py-0.5"
            aria-label={`${title}: maximum`}
          />
          <span>inches</span>
        </>
      )}
    </div>
  );
}
