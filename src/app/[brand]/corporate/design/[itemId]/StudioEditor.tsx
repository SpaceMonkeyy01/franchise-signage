'use client';

// The brand admin's Studio editor (SPEC v2.6 §8, layout DECISIONS #189).
// A status bar stays at the top with the price, whether there are unsaved
// changes, Preview and Save. Left: the design — logo, size and options, each
// option one row with its value and a "Let franchisees choose" switch, the
// options grouped Look / Installation / Technical. Right: the engine's mockup
// and a plain summary of what franchisees may change. Pricing takes ~15 s and
// is billed, so it runs when asked; Save prices again on the server whatever
// this page showed.

import { useEffect, useMemo, useState, useTransition } from 'react';

import { DEPTH, SIZE, label, type DesignRule, type DesignRules, type SignDesign } from '@/lib/designs/design';
import { fileUrl } from '@/lib/storage/url';

import { downloadPreviewSheet } from '@/components/downloadSheet';

import { previewDesignAction, saveDesignAction, uploadLogoAction, brandLogoAction } from '../actions';

type Options = Record<string, readonly { value: string; name?: string }[]>;

const input = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm';

const INSTALLATION = new Set(['application', 'mounting_type', 'ul_mandatory', 'ul_required', 'uv_printing_needed', 'sides', 'illumination']);

/** Which section an option belongs to: numbers are technical, a few are about installing, the rest is the look. */
function groupOf(name: string, values: readonly { value: string }[]): 'look' | 'installation' | 'technical' {
  if (INSTALLATION.has(name)) return 'installation';
  if (values.length > 0 && values.every((v) => /^[\d.]+$/.test(v.value))) return 'technical';
  return 'look';
}

const GROUPS = [
  { key: 'look', title: 'Look', hint: 'How the sign looks.' },
  { key: 'installation', title: 'Installation', hint: 'Where and how it is mounted.' },
  { key: 'technical', title: 'Technical', hint: 'Fabrication sizes; the defaults suit most stores.' },
] as const;

export function StudioEditor({
  brandSlug,
  itemId,
  hasBrandLogo,
  priced,
  options,
  saved,
  savedRules,
  pinned,
}: {
  brandSlug: string;
  itemId: string;
  hasBrandLogo: boolean;
  /** False for a custom-quote type: the Studio draws it but the team prices it. */
  priced: boolean;
  options: Options;
  saved: SignDesign | null;
  savedRules: DesignRules;
  pinned: Record<string, unknown>;
}) {
  const initialOptions = useMemo(() => {
    const chosen: Record<string, string> = {};
    for (const [name, values] of Object.entries(options)) {
      const from = saved?.options[name] ?? (typeof pinned[name] === 'string' ? (pinned[name] as string) : undefined);
      // A new design mounts flush/stud unless the brand chose otherwise (owner, 6 Oct).
      const preferred = name === 'mounting_type' ? values.find((v) => /flush/i.test(v.value))?.value : undefined;
      chosen[name] = from && values.some((v) => v.value === from) ? from : (preferred ?? values[0].value);
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
  // Until the admin sets the size limits themselves, a first design's limits
  // follow the size it is given; otherwise a 96" sign kept 18–30" and the
  // server refused to save it ("limits must include the design's own value").
  const [sizeRuleAuto, setSizeRuleAuto] = useState(!saved);
  function changeInches(value: string) {
    setInches(value);
    const size = Number(value);
    if (sizeRuleAuto && Number.isFinite(size) && size > 0) {
      setRules((all) => ({
        ...all,
        [SIZE]: { mode: 'range', min: Math.round(size * 0.75 * 4) / 4, max: Math.round(size * 1.25 * 4) / 4 },
      }));
    }
  }
  const [preview, setPreview] = useState<SignDesign | null>(saved);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState<null | 'logo' | 'preview' | 'save'>(null);
  const [, startTransition] = useTransition();

  // What is saved, to tell the admin when the page holds unsaved changes.
  const snapshot = () => JSON.stringify({ logo: logo?.path, chosen, axis, inches: inches.trim(), depth: depth.trim(), rules });
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    saved
      ? JSON.stringify({
          logo: saved.logo.path,
          chosen: initialOptions,
          axis: saved.dimension.axis,
          inches: String(saved.dimension.inches),
          depth: saved.depthInches ? String(saved.depthInches) : '',
          rules: savedRules,
        })
      : '',
  );
  const dirty = snapshot() !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
  const current = Boolean(
    preview &&
      logo &&
      preview.logo.path === logo.path &&
      preview.dimension.axis === axis &&
      String(preview.dimension.inches) === inches.trim() &&
      String(preview.depthInches ?? '') === depth.trim() &&
      Object.entries(chosen).every(([name, value]) => preview.options[name] === value),
  );

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
    const at = snapshot();
    run('save', async () => {
      const result = await saveDesignAction(brandSlug, itemId, next, rules);
      if ('error' in result) setMessage({ tone: 'error', text: result.error });
      else {
        setPreview(result.design);
        setSavedSnapshot(at);
        setMessage({
          tone: 'ok',
          text: priced
            ? 'Saved. Franchisees see this design and price from now on.'
            : 'Saved. Franchisees see this design from now on; Signage.com quotes it per order.',
        });
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

  const grouped = GROUPS.map((group) => ({
    ...group,
    entries: Object.entries(options).filter(([name, values]) => groupOf(name, values) === group.key),
  })).filter((group) => group.entries.length > 0);

  const sizeRule = rules[SIZE];
  const depthRule = rules[DEPTH];
  const adjustable = [
    sizeRule?.mode === 'range' && `${axis === 'height' ? 'Height' : 'Width'} ${sizeRule.min}–${sizeRule.max}"`,
    depth.trim() && depthRule?.mode === 'range' && `Depth ${depthRule.min}–${depthRule.max}"`,
    ...Object.entries(rules)
      .filter(([name, rule]) => name !== SIZE && name !== DEPTH && rule.mode === 'choices')
      .map(([name, rule]) => `${label(name)}: ${rule.mode === 'choices' ? rule.values.length : 0} choices`),
  ].filter((line): line is string => Boolean(line));

  return (
    <div className="mt-5">
      {/* Status bar: stays in view on a long page. */}
      <div className="sticky top-[4.5rem] z-20 -mx-1 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-[11px] text-gray-500">{priced ? (current ? 'Price' : 'Price of the last preview') : 'Price'}</p>
              <p className="text-lg font-semibold leading-tight text-gray-900" data-studio-price>
                {priced ? (preview?.price ? `$${preview.price.toLocaleString('en-US')}` : '—') : 'Custom quote'}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                dirty ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              {dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Not saved yet'}
            </span>
            {!current && preview && (
              <span className="text-xs text-amber-700">The preview is out of date.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {preview?.price && current && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  const next = design();
                  if (!next) return;
                  run('preview', async () => {
                    const failed = await downloadPreviewSheet({ brandSlug, as: 'brand', brandItemId: itemId, design: next });
                    if (failed) setMessage({ tone: 'error', text: failed });
                  });
                }}
                className="px-2 text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
              >
                Quote sheet (PDF)
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={onPreview}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-gray-400 disabled:opacity-50"
            >
              {busy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={onSave}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}
            >
              {busy === 'save' ? 'Saving…' : 'Save design'}
            </button>
          </div>
        </div>
        {message && (
          <p className={`mt-2 text-xs ${message.tone === 'error' ? 'text-rose-700' : 'text-green-800'}`}>{message.text}</p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {/* Logo */}
          <Section title="Logo" hint="PNG, JPG or WEBP, up to 2 MB. Franchisees cannot change it.">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="flex h-24 w-48 items-center justify-center rounded-lg border border-gray-200 p-2"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg,#f3f4f6 25%,transparent 25%),linear-gradient(-45deg,#f3f4f6 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f3f4f6 75%),linear-gradient(-45deg,transparent 75%,#f3f4f6 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                }}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(logo.path)} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">No logo yet</span>
                )}
              </div>
              <div className="flex flex-col items-start gap-2">
                <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-gray-400">
                  {busy === 'logo' ? 'Uploading…' : logo ? 'Upload a new logo' : 'Upload logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
                {hasBrandLogo && (
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
            </div>
          </Section>

          {/* Size */}
          <Section title="Size" hint="Give one dimension; the Studio works out the other from the logo's shape.">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-gray-700">
                Measure by
                <select value={axis} onChange={(e) => setAxis(e.target.value as 'height' | 'width')} className={`${input} mt-1 block`}>
                  <option value="height">Height</option>
                  <option value="width">Width</option>
                </select>
              </label>
              <label className="text-xs font-medium text-gray-700">
                {axis === 'height' ? 'Height' : 'Width'} (inches)
                <input value={inches} onChange={(e) => changeInches(e.target.value)} inputMode="decimal" className={`${input} mt-1 block w-28`} />
              </label>
              <label className="text-xs font-medium text-gray-700">
                Depth (inches, optional)
                <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" placeholder="standard" className={`${input} mt-1 block w-28`} />
              </label>
            </div>
            <RangeRule
              title={`Franchisees may adjust the ${axis}`}
              rule={sizeRule}
              current={Number(inches)}
              onChange={(rule) => {
                setSizeRuleAuto(false);
                setRule(SIZE, rule);
              }}
            />
            {depth.trim() && (
              <RangeRule
                title="Franchisees may adjust the depth"
                rule={depthRule}
                current={Number(depth)}
                onChange={(rule) => setRule(DEPTH, rule)}
              />
            )}
          </Section>

          {/* Options, grouped */}
          {grouped.map((group) => (
            <details key={group.key} open={group.key !== 'technical'} className="group/section rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{group.title}</span>
                  <span className="block text-xs text-gray-500">
                    {group.hint} {group.entries.filter(([name]) => rules[name]?.mode === 'choices').length > 0 &&
                      `· ${group.entries.filter(([name]) => rules[name]?.mode === 'choices').length} open to franchisees`}
                  </span>
                </span>
                <span className="text-gray-400 transition-transform group-open/section:rotate-90" aria-hidden>
                  ▸
                </span>
              </summary>
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {group.entries.map(([name, values]) => (
                  <OptionRow
                    key={name}
                    name={name}
                    values={values}
                    value={chosen[name]}
                    rule={rules[name]}
                    onValue={(value) => {
                      setChosen((all) => ({ ...all, [name]: value }));
                      const rule = rules[name];
                      if (rule?.mode === 'choices' && !rule.values.includes(value)) {
                        setRule(name, { mode: 'choices', values: [value, ...rule.values] });
                      }
                    }}
                    onRule={(rule) => setRule(name, rule)}
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>

        {/* Preview and what franchisees may change */}
        <aside className="space-y-4 lg:sticky lg:top-44 lg:self-start">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="relative aspect-square w-full bg-gray-100">
              {busy === 'preview' || busy === 'save' ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                  {priced ? 'Drawing and pricing… about 15 seconds.' : 'Drawing the sign… a few seconds.'}
                </div>
              ) : preview?.mockupPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(preview.mockupPath)} alt="Mockup" className={`h-full w-full object-cover ${current ? '' : 'opacity-50'}`} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                  Press Preview to see the sign{priced ? ' and its price' : ''}.
                </div>
              )}
            </div>
            {preview && (
              <dl className="grid grid-cols-2 gap-px bg-gray-100 text-sm">
                <div className="bg-white px-3 py-2">
                  <dt className="text-[11px] text-gray-500">Overall size</dt>
                  <dd className="font-medium text-gray-900">
                    {preview.widthInches && preview.heightInches ? `${preview.widthInches}" × ${preview.heightInches}"` : `${preview.dimension.inches}" ${preview.dimension.axis}`}
                  </dd>
                </div>
                <div className="bg-white px-3 py-2">
                  <dt className="text-[11px] text-gray-500">{priced ? 'Made in about' : 'Price'}</dt>
                  <dd className="font-medium text-gray-900">
                    {priced ? (preview.turnaroundDays ? `${preview.turnaroundDays} days` : '—') : 'Custom quote'}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">What franchisees can change</h2>
            {adjustable.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                {adjustable.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--color-brand)' }} />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-600">Nothing: every store gets exactly this design.</p>
            )}
            <p className="mt-3 border-t border-gray-100 pt-2 text-xs leading-relaxed text-gray-500">
              Everything else, including the logo, stays as you set it. A franchisee can still ask for more; that sign
              then comes to you for approval.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One option: its value, and whether franchisees may choose from a set. */
function OptionRow({
  name,
  values,
  value,
  rule,
  onValue,
  onRule,
}: {
  name: string;
  values: readonly { value: string; name?: string }[];
  value: string;
  rule: DesignRule | undefined;
  onValue: (value: string) => void;
  onRule: (rule: DesignRule | null) => void;
}) {
  const open = rule?.mode === 'choices';
  const allowed = open ? rule.values : [value];
  return (
    <li className="px-4 py-3 sm:px-5" data-option={name}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-gray-900">
          <span className="w-40 shrink-0 font-medium">{label(name)}</span>
          <select value={value} onChange={(e) => onValue(e.target.value)} className={input}>
            {values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.name ?? v.value}
              </option>
            ))}
          </select>
        </label>
        {values.length > 1 && (
          <Switch
            on={open}
            label="Let franchisees choose"
            onChange={(on) => onRule(on ? { mode: 'choices', values: values.map((v) => v.value) } : null)}
          />
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5 sm:pl-[10.75rem]" role="group" aria-label={`${label(name)} choices`}>
          {values.map((v) => {
            const isCurrent = v.value === value;
            const on = allowed.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                disabled={isCurrent}
                aria-pressed={on}
                onClick={() => {
                  const set = new Set(allowed);
                  if (on) set.delete(v.value);
                  else set.add(v.value);
                  set.add(value);
                  onRule(set.size > 1 ? { mode: 'choices', values: [...set] } : null);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on ? 'font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                } ${isCurrent ? 'cursor-default' : ''}`}
                style={on ? { borderColor: 'var(--color-brand)', background: 'var(--color-brand-light)', color: 'var(--color-brand-dark)' } : undefined}
                title={isCurrent ? 'The default; always allowed' : undefined}
              >
                {on ? '✓ ' : ''}
                {v.name ?? v.value}
                {isCurrent ? ' (default)' : ''}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function Switch({ on, label: text, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-xs text-gray-600"
    >
      <span
        className="relative inline-block h-5 w-9 rounded-full transition-colors"
        style={{ background: on ? 'var(--color-brand)' : '#D1D5DB' }}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
      {text}
    </button>
  );
}

/** A size limit: off, or a min–max with the design's own value inside it, drawn as a bar. */
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
  const valid = Number.isFinite(current) && current > 0;
  return (
    <div className="mt-4 rounded-lg bg-gray-50 p-3">
      <Switch
        on={on}
        label={title}
        onChange={(next) =>
          onChange(
            next && valid
              ? { mode: 'range', min: Math.round(current * 0.75 * 4) / 4, max: Math.round(current * 1.25 * 4) / 4 }
              : null,
          )
        }
      />
      {on && rule.mode === 'range' && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            from
            <input
              value={rule.min}
              onChange={(e) => onChange({ ...rule, min: Number(e.target.value) })}
              inputMode="decimal"
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              aria-label={`${title}: minimum`}
            />
            to
            <input
              value={rule.max}
              onChange={(e) => onChange({ ...rule, max: Number(e.target.value) })}
              inputMode="decimal"
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
              aria-label={`${title}: maximum`}
            />
            inches
          </div>
          {valid && rule.max > rule.min && <RangeBar min={rule.min} max={rule.max} current={current} />}
        </>
      )}
    </div>
  );
}

function RangeBar({ min, max, current }: { min: number; max: number; current: number }) {
  // The track runs a little past the limits so both ends and the design's size show.
  const lo = Math.min(min, current) * 0.8;
  const hi = Math.max(max, current) * 1.1;
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  const inside = current >= min && current <= max;
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-gray-200">
        <span className="absolute top-0 h-2 rounded-full" style={{ left: at(min), right: `calc(100% - ${at(max)})`, background: 'var(--color-brand)', opacity: 0.5 }} />
        <span
          className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow"
          style={{ left: at(current), background: inside ? 'var(--color-brand)' : '#B45309' }}
          title={`Design: ${current}"`}
        />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-gray-500">
        <span className="absolute -translate-x-1/2" style={{ left: at(min) }}>
          {min}&quot;
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: at(max) }}>
          {max}&quot;
        </span>
      </div>
      {!inside && <p className="text-[11px] text-amber-800">The design&apos;s own size must sit inside the range.</p>}
    </div>
  );
}
