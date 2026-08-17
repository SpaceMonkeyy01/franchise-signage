'use client';

import { useState, useTransition } from 'react';

import { CatalogCard } from '@/components/CatalogCard';
import { PhotoUpload } from '@/components/PhotoUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { SizingField } from '@/components/SizingField';
import { formatPrice, VendorChip } from '@/components/StatusChip';
import type { BrandItemRow, BrandPublic, PackageRow } from '@/lib/db/queries';
import type { LocationFormat } from '@/lib/status/types';
import type { StoredObject } from '@/lib/storage';

import { submitInitialSetup } from './actions';

interface ItemState {
  /** Stable per instance: an endcap loads two storefront sets (SPEC §3.2). */
  key: string;
  brandItemId: string;
  fromPackage: boolean;
  sizing: string;
  tbd: boolean;
  exceptionIssue: string | null;
  photo: StoredObject | null;
}

const STEP_COUNT = 4;

export function SetupWizard({
  brand,
  packages,
  catalog,
}: {
  brand: BrandPublic;
  packages: PackageRow[];
  catalog: BrandItemRow[];
}) {
  const [step, setStep] = useState(1);
  const [basics, setBasics] = useState({
    name: '',
    line1: '',
    city: '',
    state: '',
    zip: '',
    openingDate: '',
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
  });
  const [format, setFormat] = useState<LocationFormat | null>(null);
  // undefined = not answered, null = "not sure yet". Both store as null (§8b:
  // "not asked" and "answered no" are different states), but only the second is
  // a choice the franchisee made, and only it should look selected.
  const [financing, setFinancing] = useState<boolean | null | undefined>(undefined);
  const [landlord, setLandlord] = useState({ name: '', email: '', phone: '' });
  const [leaseExhibit, setLeaseExhibit] = useState<StoredObject | null>(null);
  const [items, setItems] = useState<ItemState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(catalog.map((item) => [item.id, item]));
  const packageItems = items.filter((item) => item.fromPackage);
  const addons = items.filter((item) => !item.fromPackage);
  const chosenFormat = packages.find((pkg) => pkg.format === format) ?? null;

  /** Switching format reloads the checklist — a different site needs different signs. */
  function chooseFormat(next: LocationFormat) {
    setFormat(next);
    const pkg = packages.find((entry) => entry.format === next);
    setItems(
      (pkg?.items ?? []).map((item, index) => ({
        key: `${item.id}#${index}`,
        brandItemId: item.id,
        fromPackage: true,
        sizing: '',
        tbd: false,
        exceptionIssue: null,
        photo: null,
      })),
    );
  }

  function patch(key: string, change: Partial<ItemState>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }

  function toggleAddon(brandItemId: string) {
    setItems((current) => {
      const existing = current.find((item) => !item.fromPackage && item.brandItemId === brandItemId);
      if (existing) return current.filter((item) => item.key !== existing.key);
      return [
        ...current,
        {
          key: `addon-${brandItemId}`,
          brandItemId,
          fromPackage: false,
          sizing: '',
          tbd: false,
          exceptionIssue: null,
          photo: null,
        },
      ];
    });
  }

  function submit() {
    if (!format) return;
    setError(null);
    startTransition(async () => {
      const failure = await submitInitialSetup({
        brandSlug: brand.slug,
        location: {
          name: basics.name,
          line1: basics.line1,
          city: basics.city,
          state: basics.state,
          zip: basics.zip,
          format,
          openingDate: basics.openingDate,
        },
        requester: {
          name: basics.requesterName,
          email: basics.requesterEmail,
          phone: basics.requesterPhone,
        },
        financingInvolved: financing ?? null,
        landlordContact: landlord.name || landlord.email || landlord.phone ? landlord : null,
        leaseExhibit,
        items: items.map((item) => ({
          brandItemId: item.brandItemId,
          fromPackage: item.fromPackage,
          sizing: item.sizing.trim() || null,
          tbd: item.tbd,
          exceptionIssue: item.exceptionIssue,
          photo: item.photo,
        })),
      });
      if (failure) setError(failure.error);
    });
  }

  return (
    <div>
      <p className="text-xs font-medium tracking-wide" style={{ color: 'var(--color-brand)' }}>
        NEW LOCATION · STEP {step} OF {STEP_COUNT}
      </p>

      {step === 1 && (
        <StepBasics
          brand={brand}
          basics={basics}
          setBasics={setBasics}
          packages={packages}
          format={format}
          chooseFormat={chooseFormat}
          financing={financing}
          setFinancing={setFinancing}
          landlord={landlord}
          setLandlord={setLandlord}
          leaseExhibit={leaseExhibit}
          setLeaseExhibit={setLeaseExhibit}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepPackage
          brand={brand}
          formatLabel={chosenFormat?.label ?? ''}
          items={packageItems}
          byId={byId}
          patch={patch}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepAddons
          brand={brand}
          catalog={catalog.filter(
            (item) => !packageItems.some((packaged) => packaged.brandItemId === item.id),
          )}
          addons={addons}
          toggleAddon={toggleAddon}
          patch={patch}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <StepReview
          brand={brand}
          basics={basics}
          formatLabel={chosenFormat?.label ?? ''}
          items={items}
          byId={byId}
          error={error}
          pending={pending}
          onBack={() => setStep(3)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- step one

type Basics = {
  name: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  openingDate: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
};

function StepBasics({
  brand,
  basics,
  setBasics,
  packages,
  format,
  chooseFormat,
  financing,
  setFinancing,
  landlord,
  setLandlord,
  leaseExhibit,
  setLeaseExhibit,
  onNext,
}: {
  brand: BrandPublic;
  basics: Basics;
  setBasics: (next: Basics) => void;
  packages: PackageRow[];
  format: LocationFormat | null;
  chooseFormat: (format: LocationFormat) => void;
  financing: boolean | null | undefined;
  setFinancing: (value: boolean | null) => void;
  landlord: { name: string; email: string; phone: string };
  setLandlord: (next: { name: string; email: string; phone: string }) => void;
  leaseExhibit: StoredObject | null;
  setLeaseExhibit: (file: StoredObject | null) => void;
  onNext: () => void;
}) {
  const set = (key: keyof Basics) => (value: string) => setBasics({ ...basics, [key]: value });

  return (
    <>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">Tell us about your location</h1>
      <p className="mt-1 text-sm text-gray-500">
        Your location format determines which standard sign package loads.
      </p>

      <div className="mt-6 space-y-4">
        <Field
          label="Location name"
          value={basics.name}
          onChange={set('name')}
          placeholder={`${brand.name} — Riverside`}
        />
        <Field label="Street address" value={basics.line1} onChange={set('line1')} placeholder="123 Main St" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City" value={basics.city} onChange={set('city')} placeholder="Austin" />
          <Field label="State" value={basics.state} onChange={set('state')} placeholder="TX" />
          <Field label="ZIP" value={basics.zip} onChange={set('zip')} placeholder="78701" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Your name"
            value={basics.requesterName}
            onChange={set('requesterName')}
            placeholder="Full name"
          />
          <Field
            label="Your email"
            value={basics.requesterEmail}
            onChange={set('requesterEmail')}
            placeholder="you@example.com"
            type="email"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Your phone"
            value={basics.requesterPhone}
            onChange={set('requesterPhone')}
            placeholder="Optional"
          />
          <Field
            label="Target opening date"
            value={basics.openingDate}
            onChange={set('openingDate')}
            placeholder="e.g. Oct 1, 2026"
          />
        </div>
      </div>

      <p className="mb-2 mt-6 text-xs font-medium text-gray-700">Location format</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {packages.map((pkg) => {
          const active = pkg.format === format;
          return (
            <button
              key={pkg.format}
              type="button"
              onClick={() => chooseFormat(pkg.format)}
              className={`rounded-xl border bg-white p-4 text-left transition-colors ${
                active ? '' : 'border-gray-200 hover:border-gray-300'
              }`}
              style={
                active
                  ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 2px var(--color-brand)' }
                  : undefined
              }
            >
              <span className="block text-sm font-medium text-gray-900">{pkg.label}</span>
              <span className="block text-[11px] text-gray-500">{pkg.description}</span>
              <span className="mt-1.5 block text-[11px] font-medium" style={{ color: 'var(--color-brand)' }}>
                {pkg.items.length}-sign standard package
              </span>
            </button>
          );
        })}
      </div>

      {/* §8b: financing is the norm, not an edge case. Asking here is what lets
          the team know a lender will need formal documents later. */}
      <fieldset className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <legend className="px-1 text-xs font-medium text-gray-700">
          Is a lender funding this location&rsquo;s signage?
        </legend>
        <p className="text-[11px] text-gray-500">
          Most franchisees fund signage with an SBA-style loan. Telling us now means the budgetary
          quote, invoice and receipt your lender asks for are ready when they ask.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Yes — a lender is involved', value: true },
            { label: 'No', value: false },
            { label: 'Not sure yet', value: null },
          ].map((option) => {
            const active = financing === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setFinancing(option.value)}
                className={`rounded-lg border py-2 text-xs transition-colors ${
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
      </fieldset>

      {/* §8b: landlord approval is TRACKED, never automated — a contact and the
          lease exhibit, nothing that promises an outcome. */}
      <fieldset className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <legend className="px-1 text-xs font-medium text-gray-700">
          Landlord &amp; lease sign criteria <span className="text-gray-400">· optional</span>
        </legend>
        <p className="text-[11px] text-gray-500">
          Most leases carry a sign exhibit setting what the landlord allows. Upload it and the team
          checks your package against it before anything is quoted. Don&rsquo;t have it yet? Submit
          anyway — this never holds up a request.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field
            label="Property manager"
            value={landlord.name}
            onChange={(value) => setLandlord({ ...landlord, name: value })}
            placeholder="Name"
          />
          <Field
            label="Their email"
            value={landlord.email}
            onChange={(value) => setLandlord({ ...landlord, email: value })}
            placeholder="Optional"
            type="email"
          />
          <Field
            label="Their phone"
            value={landlord.phone}
            onChange={(value) => setLandlord({ ...landlord, phone: value })}
            placeholder="Optional"
          />
        </div>
        <div className="mt-3">
          <PhotoUpload
            label="Upload the lease sign exhibit (PDF or photo)"
            prefix={brand.slug}
            value={leaseExhibit}
            onChange={setLeaseExhibit}
          />
        </div>
      </fieldset>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!format || !basics.name.trim()}
          className="rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          Load my sign package →
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------- step two

function StepPackage({
  brand,
  formatLabel,
  items,
  byId,
  patch,
  onBack,
  onNext,
}: {
  brand: BrandPublic;
  formatLabel: string;
  items: ItemState[];
  byId: Map<string, BrandItemRow>;
  patch: (key: string, change: Partial<ItemState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [open, setOpen] = useState<string | null>(items[0]?.key ?? null);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState('');

  const configured = items.filter((item) => item.sizing.trim() || item.tbd || item.photo).length;

  return (
    <>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">
        Your location requires these {items.length} signs
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Pre-approved for {formatLabel.toLowerCase()} locations — brand specs are locked, you only
        provide site details.
      </p>

      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const brandItem = byId.get(item.brandItemId);
          if (!brandItem) return null;
          const isOpen = open === item.key;
          const done = Boolean(item.sizing.trim() || item.tbd || item.photo);

          return (
            <div
              key={item.key}
              className={`rounded-xl border bg-white ${
                item.exceptionIssue ? 'border-rose-200' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.key)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      done ? '' : 'border border-gray-300'
                    }`}
                    style={done ? { background: 'var(--color-brand-light)', color: 'var(--color-brand)' } : undefined}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
                      {brandItem.name}
                      <VendorChip
                        policy={brandItem.vendor_policy_override ?? brand.vendor_policy}
                        vendorName={brand.vendor_name}
                      />
                      <span className="text-[11px] font-normal text-gray-500">
                        {formatPrice(brandItem.est_price)}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {brandItem.spec_summary}
                      {item.exceptionIssue && (
                        <span className="text-rose-500"> · issue flagged</span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-gray-400">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  <SignThumbnail
                    renderKey={brandItem.render_key}
                    label={brandItem.name}
                    className="mb-3 h-24 w-full rounded-lg border border-gray-100"
                  />

                  <div className="mb-3">
                    <PhotoUpload
                      label="Upload placement photo"
                      prefix={brand.slug}
                      value={item.photo}
                      onChange={(photo) => patch(item.key, { photo })}
                    />
                  </div>

                  <SizingField
                    siteVariables={brandItem.site_variables}
                    value={item.sizing}
                    tbd={item.tbd}
                    onValueChange={(sizing) => patch(item.key, { sizing })}
                    onTbdChange={(tbd) => patch(item.key, { tbd })}
                  />

                  <div className="mt-3">
                    {item.exceptionIssue ? (
                      <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Issue: &ldquo;{item.exceptionIssue}&rdquo; — corporate will review this item.{' '}
                        <button
                          type="button"
                          onClick={() => patch(item.key, { exceptionIssue: null })}
                          className="underline"
                        >
                          Undo
                        </button>
                      </div>
                    ) : flagging === item.key ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                        <p className="mb-1 text-xs font-medium text-rose-800">
                          What&rsquo;s the issue with this standard sign?
                        </p>
                        <textarea
                          value={flagNote}
                          onChange={(event) => setFlagNote(event.target.value)}
                          rows={2}
                          placeholder="e.g. Landlord prohibits illuminated signage"
                          className="mb-2 w-full rounded-lg border border-rose-200 px-2 py-1.5 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!flagNote.trim()}
                            onClick={() => {
                              patch(item.key, { exceptionIssue: flagNote.trim() });
                              setFlagging(null);
                              setFlagNote('');
                            }}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                          >
                            Flag for corporate review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFlagging(null);
                              setFlagNote('');
                            }}
                            className="px-2 text-xs text-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFlagging(item.key)}
                        className="text-xs text-gray-400 transition-colors hover:text-rose-600"
                      >
                        ⚑ This standard sign won&rsquo;t work at my site
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={`Continue · ${configured}/${items.length} configured →`}
      />
    </>
  );
}

// ----------------------------------------------------------------- step three

function StepAddons({
  brand,
  catalog,
  addons,
  toggleAddon,
  patch,
  onBack,
  onNext,
}: {
  brand: BrandPublic;
  catalog: BrandItemRow[];
  addons: ItemState[];
  toggleAddon: (brandItemId: string) => void;
  patch: (key: string, change: Partial<ItemState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">
        Anything beyond the standard package?
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Optional items from the approved {brand.name} catalog. Add-ons require corporate approval
        before quoting.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {catalog.map((item) => {
          const chosen = addons.find((addon) => addon.brandItemId === item.id);
          return (
            <CatalogCard
              key={item.id}
              item={item}
              brand={brand}
              selected={Boolean(chosen)}
              onToggle={() => toggleAddon(item.id)}
            >
              {chosen && (
                <SizingField
                  siteVariables={item.site_variables}
                  value={chosen.sizing}
                  tbd={chosen.tbd}
                  onValueChange={(sizing) => patch(chosen.key, { sizing })}
                  onTbdChange={(tbd) => patch(chosen.key, { tbd })}
                />
              )}
            </CatalogCard>
          );
        })}
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={addons.length ? 'Continue →' : 'No add-ons needed →'}
      />
    </>
  );
}

// ------------------------------------------------------------------ step four

function StepReview({
  brand,
  basics,
  formatLabel,
  items,
  byId,
  error,
  pending,
  onBack,
  onSubmit,
}: {
  brand: BrandPublic;
  basics: Basics;
  formatLabel: string;
  items: ItemState[];
  byId: Map<string, BrandItemRow>;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  // A preview of the SPEC §7 split, under the standard model — the same
  // assumption docs/flow-demo.jsx makes. The server derives the real statuses
  // from the brand's approval_mode in deriveInitialItemStatus(); this is a
  // summary of what to expect, not the decision.
  const goesToCorporate = (item: ItemState) => !item.fromPackage || Boolean(item.exceptionIssue);
  const immediate = items.filter((item) => !goesToCorporate(item));
  const pendingItems = items.filter(goesToCorporate);

  const priced = items.filter((item) => byId.get(item.brandItemId)?.est_price != null);
  const total = priced.reduce((sum, item) => sum + Number(byId.get(item.brandItemId)!.est_price), 0);
  const external = brand.vendor_policy !== 'signage_com';

  return (
    <>
      <h1 className="mt-1 text-xl font-semibold text-gray-900">
        {basics.name || 'Your location'} · {items.length} signs
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Opens {basics.openingDate || 'TBD'} · {formatLabel}
      </p>

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-gray-900">
          Proceeding immediately ({immediate.length})
        </h2>
        {immediate.map((item) => (
          <ReviewRow key={item.key} item={item} brand={brand} byId={byId} />
        ))}
      </section>

      {pendingItems.length > 0 && (
        <section className="mt-3 rounded-xl border border-amber-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-gray-900">
            Going to corporate for approval ({pendingItems.length})
          </h2>
          {pendingItems.map((item) => (
            <ReviewRow key={item.key} item={item} brand={brand} byId={byId} />
          ))}
        </section>
      )}

      <section className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">
            Estimated total ({priced.length} priced item{priced.length === 1 ? '' : 's'})
          </span>
          <span className="font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
            {formatPrice(total)}
          </span>
        </div>
        {items.length > priced.length && (
          <p className="mt-1 text-[11px] text-gray-400">
            + {items.length - priced.length} custom-quote item
            {items.length - priced.length === 1 ? '' : 's'} priced by the Signage.com team after
            submission
          </p>
        )}
        <p className="mt-1 text-[10px] text-gray-400">
          {external
            ? `Per ${brand.name} vendor policy, approved items route to ${
                brand.vendor_name ?? 'the brand’s vendor'
              } — they provide final pricing directly. Figures shown are Signage.com reference estimates.`
            : `Estimates from standard brand specs; final quote follows approval. Per ${brand.name} vendor policy, approved items route to ${
                brand.vendor_name ?? 'Signage.com'
              }.`}
        </p>
      </section>

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <StepNav
        onBack={onBack}
        onNext={onSubmit}
        nextLabel={pending ? 'Submitting…' : 'Submit location request →'}
        nextDisabled={pending}
      />
    </>
  );
}

function ReviewRow({
  item,
  brand,
  byId,
}: {
  item: ItemState;
  brand: BrandPublic;
  byId: Map<string, BrandItemRow>;
}) {
  const brandItem = byId.get(item.brandItemId);
  if (!brandItem) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
      <span className="flex flex-wrap items-center gap-2 text-gray-700">
        {brandItem.name}
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
          {item.fromPackage ? (item.exceptionIssue ? 'Exception' : 'Standard') : 'Add-on'}
        </span>
        <VendorChip
          policy={brandItem.vendor_policy_override ?? brand.vendor_policy}
          vendorName={brand.vendor_name}
        />
      </span>
      <span className="text-xs text-gray-400">
        {item.exceptionIssue
          ? `“${item.exceptionIssue}”`
          : item.tbd
            ? 'TBD flagged'
            : item.sizing.trim() || (item.photo ? 'photo attached' : '—')}
      </span>
    </div>
  );
}

// -------------------------------------------------------------------- shared

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-gray-600">
        ← Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--color-brand)' }}
      >
        {nextLabel}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}
