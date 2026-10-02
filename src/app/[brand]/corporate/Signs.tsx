'use client';

// The brand's signs, on the corporate dashboard (SPEC v2.4 §2.3).
//
// Everything a franchisee can order comes from here. A brand admin proposes a
// new sign from the Signage.com catalog — a variant, the choices the brand
// locks, a name — and Signage.com prices and approves it before any
// franchisee sees it. Live signs can be retired at once. Reviewers read.
// Prices are shown, never entered: Signage.com sets every one.

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { ImageUpload } from '@/components/ImageUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { attributeLabel, signStatus } from '@/lib/catalog/labels';
import type { ManagedSign, MasterRow } from '@/lib/catalog/manage';
import type { SubmitFailure } from '@/lib/forms';

import {
  proposeSignAction,
  reviseSignAction,
  setBrandSignActiveAction,
  setBrandSignImageAction,
  withdrawSignAction,
} from './catalog-actions';

const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm';

function priceLabel(sign: ManagedSign): string {
  if (sign.review_status !== 'approved') return 'Priced by Signage.com on approval';
  return sign.est_price === null ? 'Custom quote' : `$${Number(sign.est_price).toLocaleString('en-US')} est.`;
}

function variantName(row: { sign_type: string; variant: string | null }) {
  return row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
}

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function go(fn: () => Promise<SubmitFailure | undefined>, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else done?.();
    });
  }
  return { error, pending, go };
}

export function Signs({
  brandSlug,
  brandName,
  canManage,
  signs,
  master,
}: {
  brandSlug: string;
  brandName: string;
  canManage: boolean;
  signs: ManagedSign[];
  /** Active master rows only: what a new sign can be built from. */
  master: MasterRow[];
}) {
  const [proposing, setProposing] = useState(false);
  const [revising, setRevising] = useState<string | null>(null);

  const groups: { title: string; hint?: string; signs: ManagedSign[] }[] = [
    {
      title: 'Waiting on Signage.com',
      hint: 'Not visible to franchisees until Signage.com prices and approves it.',
      signs: signs.filter((s) => s.review_status === 'pending'),
    },
    {
      title: 'Not approved',
      hint: 'Revise and send again, or withdraw.',
      signs: signs.filter((s) => s.review_status === 'declined'),
    },
    { title: 'Active', signs: signs.filter((s) => s.review_status === 'approved' && s.active) },
    {
      title: 'Inactive',
      hint: 'Stores that have these keep them, and replacing one comes to you for approval. Nobody can order a new one.',
      signs: signs.filter((s) => s.review_status === 'approved' && !s.active),
    },
  ];

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold text-gray-900">{brandName} signs</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            What your franchisees can order. New signs are built from the Signage.com catalog and go live
            once Signage.com has priced them. Prices are estimates set by Signage.com.
          </p>
        </div>
        {canManage && !proposing && (
          <button
            type="button"
            onClick={() => setProposing(true)}
            className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Propose a new sign
          </button>
        )}
      </div>

      {proposing && (
        <div className="mt-4">
          <ProposalForm
            brandSlug={brandSlug}
            brandName={brandName}
            master={master}
            onDone={() => setProposing(false)}
          />
        </div>
      )}

      {groups
        .filter((group) => group.signs.length > 0)
        .map((group) => (
          <div key={group.title} className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {group.title} <span className="font-normal">({group.signs.length})</span>
            </h3>
            {group.hint && <p className="mt-0.5 text-xs text-gray-500">{group.hint}</p>}
            <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
              {group.signs.map((sign) =>
                revising === sign.id ? (
                  <ProposalForm
                    key={sign.id}
                    brandSlug={brandSlug}
                    brandName={brandName}
                    master={master}
                    existing={sign}
                    onDone={() => setRevising(null)}
                  />
                ) : (
                  <SignRow
                    key={sign.id}
                    brandSlug={brandSlug}
                    sign={sign}
                    canManage={canManage}
                    onRevise={() => setRevising(sign.id)}
                  />
                ),
              )}
            </div>
          </div>
        ))}
    </section>
  );
}

function SignRow({
  brandSlug,
  sign,
  canManage,
  onRevise,
}: {
  brandSlug: string;
  sign: ManagedSign;
  canManage: boolean;
  onRevise: () => void;
}) {
  const status = signStatus(sign);
  const { error, pending, go } = useAction();
  const underReview = sign.review_status !== 'approved';

  return (
    <article className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        {canManage ? (
          <span data-sign-image={sign.name}>
            <ImageUpload
              hasImage={!!sign.thumbnail_url}
              save={(formData) => setBrandSignImageAction(brandSlug, sign.id, formData)}
            >
              <SignThumbnail
                renderKey={sign.render_key}
                imagePath={sign.image_path}
                label={sign.name}
                className="block h-11 w-16 rounded-md"
              />
            </ImageUpload>
          </span>
        ) : (
          <SignThumbnail renderKey={sign.render_key} imagePath={sign.image_path} label={sign.name} className="h-11 w-16 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-900">{sign.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
          </div>
          <p className="text-xs text-gray-500">
            {variantName(sign)} · {sign.placement}
          </p>
          {sign.spec_summary && <p className="mt-0.5 text-xs text-gray-700">{sign.spec_summary}</p>}
          <p className="mt-0.5 text-xs text-gray-500">
            {priceLabel(sign)}
            {sign.installed > 0 && ` · installed at ${sign.installed} store${sign.installed === 1 ? '' : 's'}`}
          </p>
          {sign.review_status === 'declined' && sign.review_note && (
            <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
              Signage.com: {sign.review_note}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-3 text-xs">
            <Link
              href={`/${brandSlug}/corporate/design/${sign.id}`}
              className="font-medium text-gray-900 underline-offset-2 hover:underline"
            >
              {sign.price_source === 'engine' ? 'Edit design' : 'Design'}
            </Link>
            {sign.price_source === 'engine' && (
              <a
                href={`/api/studio/sheet/${sign.id}?brand=${brandSlug}`}
                className="text-gray-700 underline-offset-2 hover:underline"
              >
                Quote sheet
              </a>
            )}
            {underReview && (
              <>
                <button type="button" onClick={onRevise} className="text-gray-700 underline-offset-2 hover:underline">
                  {sign.review_status === 'declined' ? 'Revise and resend' : 'Edit'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Withdraw ${sign.name}? It is removed for good.`)) {
                      go(() => withdrawSignAction(brandSlug, sign.id));
                    }
                  }}
                  className="text-rose-700 underline-offset-2 hover:underline disabled:opacity-40"
                >
                  Withdraw
                </button>
              </>
            )}
            {!underReview && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (
                    sign.active &&
                    !window.confirm(
                      `Deactivate ${sign.name}? It leaves your catalog and every standard package now. Stores that have it keep it and can still replace it, with your approval; nobody can order a new one.`,
                    )
                  ) {
                    return;
                  }
                  go(() => setBrandSignActiveAction(brandSlug, sign.id, !sign.active));
                }}
                className={`underline-offset-2 hover:underline disabled:opacity-40 ${sign.active ? 'text-rose-700' : 'text-gray-700'}`}
              >
                {pending ? '…' : sign.active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </article>
  );
}

/** Pick a variant from the Signage.com catalog, lock choices, name it. */
function ProposalForm({
  brandSlug,
  brandName,
  master,
  existing,
  onDone,
}: {
  brandSlug: string;
  brandName: string;
  master: MasterRow[];
  existing?: ManagedSign;
  onDone: () => void;
}) {
  const start = existing ? master.find((row) => row.id === existing.master_id) : undefined;
  const [placement, setPlacement] = useState<'indoor' | 'outdoor'>(start?.placement ?? 'outdoor');
  const [signType, setSignType] = useState(start?.sign_type ?? '');
  const [masterId, setMasterId] = useState(start?.id ?? '');
  const [pinned, setPinned] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(existing?.pinned_attributes ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [note, setNote] = useState(existing?.submission_note ?? '');
  const { error, pending, go } = useAction();

  const types = useMemo(
    () => [...new Set(master.filter((row) => row.placement === placement).map((row) => row.sign_type))].sort(),
    [master, placement],
  );
  const variants = master.filter((row) => row.placement === placement && row.sign_type === signType);
  const chosen = master.find((row) => row.id === masterId) ?? null;

  function pickType(next: string) {
    setSignType(next);
    const only = master.filter((row) => row.placement === placement && row.sign_type === next);
    setMasterId(only.length === 1 ? only[0].id : '');
    setPinned({});
    if (!existing && next) setName(`${brandName} ${next}`);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const proposal = { masterId, name, pinned, note: note || null };
        go(
          () =>
            existing
              ? reviseSignAction(brandSlug, existing.id, proposal)
              : proposeSignAction(brandSlug, proposal),
          onDone,
        );
      }}
      className="space-y-3 rounded-xl xl:col-span-2 border border-[var(--color-brand)]/30 bg-white p-4"
    >
      <p className="text-sm font-semibold text-gray-900">
        {existing ? `Revise ${existing.name}` : 'Propose a new sign'}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs text-gray-600">
          Where it goes
          <select
            className={`${input} mt-1 w-full`}
            value={placement}
            onChange={(e) => {
              setPlacement(e.target.value as 'indoor' | 'outdoor');
              setSignType('');
              setMasterId('');
              setPinned({});
            }}
          >
            <option value="outdoor">Outdoor</option>
            <option value="indoor">Indoor</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Sign type
          <select className={`${input} mt-1 w-full`} value={signType} onChange={(e) => pickType(e.target.value)} required>
            <option value="">Choose…</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Style
          <select
            className={`${input} mt-1 w-full`}
            value={masterId}
            onChange={(e) => {
              setMasterId(e.target.value);
              setPinned({});
            }}
            disabled={!signType}
            required
          >
            <option value="">{signType ? 'Choose…' : '—'}</option>
            {variants.map((row) => (
              <option key={row.id} value={row.id}>
                {row.variant ?? 'Standard'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chosen && (
        <div className="flex flex-wrap gap-4 rounded-lg bg-gray-50 p-3">
          <SignThumbnail renderKey={chosen.render_key} imagePath={chosen.icon_path} label={variantName(chosen)} className="h-14 w-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-gray-600">
              {chosen.pricing_basis === 'standin'
                ? 'Signage.com quotes this type per order: it will show as a custom quote.'
                : 'Signage.com sets an estimate for this sign when approving it.'}
            </p>
            {Object.keys(chosen.options).length > 0 ? (
              <>
                <p className="text-xs font-medium text-gray-700">
                  Lock choices for every store (leave a choice to each store to decide):
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.entries(chosen.options).map(([attribute, values]) => (
                    <label key={attribute} className="text-xs text-gray-600">
                      {attributeLabel(attribute)}
                      <select
                        className={`${input} mt-1 w-full`}
                        value={pinned[attribute] ?? ''}
                        onChange={(e) =>
                          setPinned((current) => {
                            const next = { ...current };
                            if (e.target.value) next[attribute] = e.target.value;
                            else delete next[attribute];
                            return next;
                          })
                        }
                      >
                        <option value="">Each store decides</option>
                        {values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">This type has no options to lock; describe it in the note.</p>
            )}
            <p className="text-[11px] text-gray-500">
              A mockup and a live price from the Design Studio will appear here once it is connected.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Name franchisees will see
          <input
            className={`${input} mt-1 w-full`}
            value={name}
            placeholder={`e.g. ${brandName} Drive-thru Menu Board`}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          Note for Signage.com (optional)
          <input
            className={`${input} mt-1 w-full`}
            value={note}
            placeholder="Where it goes, rough size, anything to know"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || !masterId}
          className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Sending…' : 'Send to Signage.com'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-gray-600">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </form>
  );
}
