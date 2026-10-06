'use client';

// Setting up a store's signs, in four steps (docs/flow-demo.jsx setup1–4):
// the location, the standard package for its type, anything beyond it, and a
// review. A step bar runs across the top and a summary of the store, its signs
// and the running estimate sits beside the steps on a wide screen
// (DECISIONS #188). The same wizard serves a store already on record that has
// no order yet (`existing`): its first order, not a new store.

import { useState, useTransition } from 'react';

import { PhotoUpload } from '@/components/PhotoUpload';
import { SignThumbnail } from '@/components/SignThumbnail';
import { SizingField } from '@/components/SizingField';
import { formatPrice, VendorChip } from '@/components/StatusChip';
import type { BrandItemRow, BrandPublic, PackageRow } from '@/lib/db/queries';
import type { LocationFormat } from '@/lib/status/types';
import type { StoredObject } from '@/lib/storage';

import { StudioAdjust, hasAdjustableDesign } from '@/components/StudioAdjust';
import type { SignDesign } from '@/lib/designs/design';

import { submitFirstOrder, submitInitialSetup } from './actions';

interface ItemState {
  /** Stable per instance: an endcap loads two storefront sets (SPEC §3.2). */
  key: string;
  brandItemId: string;
  fromPackage: boolean;
  sizing: string;
  tbd: boolean;
  exceptionIssue: string | null;
  photo: StoredObject | null;
  /** Adjusted in the Studio (SPEC v2.6 §8); null keeps the brand's design. */
  design: SignDesign | null;
}

/** Its Studio price when adjusted, else the catalog's. */
function itemPrice(item: ItemState, brandItem: BrandItemRow | undefined): number | null {
  if (item.design?.price) return item.design.price;
  return brandItem?.est_price == null ? null : Number(brandItem.est_price);
}

const STEPS = ['Location', 'Package', 'Add-ons', 'Review'] as const;

/** A store already on record that has no order yet: its first order, not a new store. */
export interface ExistingStore {
  id: string;
  name: string;
  address: { line1?: string; city?: string; state?: string; zip?: string };
  format: LocationFormat;
}

/** A format's standard package as the checklist's starting items. */
function standardItems(packages: PackageRow[], format: LocationFormat): ItemState[] {
  const pkg = packages.find((entry) => entry.format === format);
  return (pkg?.items ?? []).map((item, index) => ({
    key: `${item.id}#${index}`,
    brandItemId: item.id,
    fromPackage: true,
    sizing: '',
    tbd: false,
    exceptionIssue: null,
    photo: null,
    design: null,
  }));
}

/** The SPEC §7 split, previewed: the server decides the real statuses. */
const goesToCorporate = (item: ItemState) => !item.fromPackage || Boolean(item.exceptionIssue);

/** What a package costs before anyone adjusts it: priced total and custom-quote count. */
function packageEstimate(pkg: PackageRow) {
  const priced = pkg.items.filter((item) => item.est_price != null);
  return {
    total: priced.reduce((sum, item) => sum + Number(item.est_price), 0),
    custom: pkg.items.length - priced.length,
  };
}

export function SetupWizard({
  brand,
  packages,
  catalog,
  requester,
  existing,
}: {
  brand: BrandPublic;
  packages: PackageRow[];
  catalog: BrandItemRow[];
  /** The signed-in account's contact details, as the starting point (SPEC v2.3). */
  requester: { name: string; email: string; phone: string };
  /** Ordering for a store on record instead of setting up a new one. */
  existing?: ExistingStore;
}) {
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const [basics, setBasics] = useState({
    name: existing?.name ?? '',
    line1: existing?.address.line1 ?? '',
    city: existing?.address.city ?? '',
    state: existing?.address.state ?? '',
    zip: existing?.address.zip ?? '',
    openingDate: '',
    requesterName: requester.name,
    requesterEmail: requester.email,
    requesterPhone: requester.phone,
  });
  const [format, setFormat] = useState<LocationFormat | null>(existing?.format ?? null);
  // undefined = not answered, null = "not sure yet". Both store as null (§8b:
  // "not asked" and "answered no" are different states), but only the second is
  // a choice the franchisee made, and only it should look selected.
  const [financing, setFinancing] = useState<boolean | null | undefined>(undefined);
  const [landlord, setLandlord] = useState({ name: '', email: '', phone: '' });
  const [leaseExhibit, setLeaseExhibit] = useState<StoredObject | null>(null);
  const [items, setItems] = useState<ItemState[]>(() =>
    existing ? standardItems(packages, existing.format) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(catalog.map((item) => [item.id, item]));
  const packageItems = items.filter((item) => item.fromPackage);
  const addons = items.filter((item) => !item.fromPackage);
  const chosenFormat = packages.find((pkg) => pkg.format === format) ?? null;

  function go(next: number) {
    setStep(next);
    setReached((most) => Math.max(most, next));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Switching format reloads the checklist — a different site needs different signs. */
  function chooseFormat(next: LocationFormat) {
    setFormat(next);
    setItems(standardItems(packages, next));
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
          design: null,
        },
      ];
    });
  }

  function submit() {
    if (!format) return;
    setError(null);
    const order = {
      brandSlug: brand.slug,
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
        design: item.design,
      })),
    };
    startTransition(async () => {
      if (existing) {
        const failure = await submitFirstOrder({ ...order, locationId: existing.id });
        if (failure) setError(failure.error);
        return;
      }
      const failure = await submitInitialSetup({
        ...order,
        location: {
          name: basics.name,
          line1: basics.line1,
          city: basics.city,
          state: basics.state,
          zip: basics.zip,
          format,
          openingDate: basics.openingDate,
        },
      });
      if (failure) setError(failure.error);
    });
  }

  const ready = Boolean(format && basics.name.trim());

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-brand)' }}>
        {existing ? `First order · ${existing.name}` : 'New store'}
      </p>
      <Stepper step={step} reached={ready ? reached : 1} onGo={go} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {step === 1 && (
            <StepBasics
              brand={brand}
              existing={existing ? { ...existing, formatLabel: chosenFormat?.label ?? '' } : undefined}
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
              ready={ready}
              onNext={() => go(2)}
            />
          )}

          {step === 2 && (
            <StepPackage
              brand={brand}
              formatLabel={chosenFormat?.label ?? ''}
              items={packageItems}
              byId={byId}
              patch={patch}
              onBack={() => go(1)}
              onNext={() => go(3)}
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
              onBack={() => go(2)}
              onNext={() => go(4)}
            />
          )}

          {step === 4 && (
            <StepReview
              brand={brand}
              basics={basics}
              existing={Boolean(existing)}
              formatLabel={chosenFormat?.label ?? ''}
              financing={financing}
              landlord={landlord}
              leaseExhibit={leaseExhibit}
              items={items}
              byId={byId}
              error={error}
              pending={pending}
              onEdit={go}
              onBack={() => go(3)}
              onSubmit={submit}
            />
          )}
        </div>

        <Summary
          hideOnPhone={step === 4}
          brand={brand}
          name={basics.name}
          address={[basics.line1, basics.city, basics.state].filter(Boolean).join(', ')}
          formatLabel={chosenFormat?.label ?? null}
          openingDate={basics.openingDate}
          items={items}
          byId={byId}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- frame

function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (step: number) => void }) {
  return (
    <ol className="mt-3 grid grid-cols-4 gap-2" aria-label="Steps">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const current = number === step;
        const done = number < step || (number <= reached && number !== step);
        const reachable = number <= reached && !current;
        return (
          <li key={label} className="min-w-0">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(number)}
              aria-current={current ? 'step' : undefined}
              className="group flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
            >
              <span
                className="h-1.5 w-full rounded-full transition-colors"
                style={{
                  background: current || done ? 'var(--color-brand)' : '#E5E7EB',
                  opacity: current ? 1 : done ? 0.55 : 1,
                }}
              />
              <span
                className={`truncate text-xs ${
                  current ? 'font-semibold text-gray-900' : reachable ? 'text-gray-600 group-hover:text-gray-900' : 'text-gray-400'
                }`}
              >
                <span className="hidden sm:inline">{number}. </span>
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Beside the steps on a wide screen, below them on a phone: the store so far. */
function Summary({
  hideOnPhone,
  brand,
  name,
  address,
  formatLabel,
  openingDate,
  items,
  byId,
}: {
  /** On the review step a phone already has every figure above. */
  hideOnPhone: boolean;
  brand: BrandPublic;
  name: string;
  address: string;
  formatLabel: string | null;
  openingDate: string;
  items: ItemState[];
  byId: Map<string, BrandItemRow>;
}) {
  const priced = items.filter((item) => itemPrice(item, byId.get(item.brandItemId)) !== null);
  const total = priced.reduce((sum, item) => sum + (itemPrice(item, byId.get(item.brandItemId)) ?? 0), 0);
  const custom = items.length - priced.length;
  const photos = items.filter((item) => item.photo).length;
  const review = items.filter(goesToCorporate).length;

  return (
    <aside className={`lg:sticky lg:top-6 lg:block lg:self-start ${hideOnPhone ? 'hidden' : ''}`}>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Your store</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">{name.trim() || 'New store'}</p>
        {address && <p className="text-xs text-gray-500">{address}</p>}
        <p className="mt-1 text-xs text-gray-500">
          {formatLabel ?? 'Store type not chosen'}
          {openingDate && ` · opens ${formatDate(openingDate)}`}
        </p>

        {items.length > 0 ? (
          <>
            <dl className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
              <Row label="Signs" value={String(items.length)} />
              <Row label="Approved automatically" value={String(items.length - review)} />
              {review > 0 && <Row label={`Needs ${brand.name} approval`} value={String(review)} tone="amber" />}
              <Row label="Site photos" value={`${photos} of ${items.length}`} />
            </dl>
            <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--color-brand-light)' }}>
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-brand-dark)' }}>
                Estimated total
              </p>
              <p className="text-xl font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
                {formatPrice(total)}
              </p>
              {custom > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--color-brand-dark)' }}>
                  + {custom} custom quote{custom === 1 ? '' : 's'}, priced by Signage.com
                </p>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
              An estimate, not a quote. The final price comes with your quote.
            </p>
          </>
        ) : (
          <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
            Choose a store type to load its standard sign package.
          </p>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${tone === 'amber' ? 'text-amber-800' : 'text-gray-900'}`}>{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
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
  existing,
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
  ready,
  onNext,
}: {
  brand: BrandPublic;
  existing?: ExistingStore & { formatLabel: string };
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
  ready: boolean;
  onNext: () => void;
}) {
  const set = (key: keyof Basics) => (value: string) => setBasics({ ...basics, [key]: value });

  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900">
        {existing ? `Choose signs for ${existing.name}` : 'Tell us about your store'}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {existing
          ? 'The standard package for this store type loads next. Confirm your contact details first.'
          : 'Your store type decides which standard sign package loads. Anything you don’t know yet can wait.'}
      </p>

      <div className="mt-5 space-y-4">
        {existing ? (
          <Card title="Store">
            <p className="text-sm font-medium text-gray-900">{existing.name}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {[existing.address.line1, existing.address.city, existing.address.state].filter(Boolean).join(', ')}
              {existing.formatLabel && ` · ${existing.formatLabel}`}
            </p>
          </Card>
        ) : (
          <Card title="Store">
            <div className="space-y-3">
              <Field
                label="Location name"
                value={basics.name}
                onChange={set('name')}
                placeholder={`${brand.name} — Riverside`}
              />
              <Field label="Street address" value={basics.line1} onChange={set('line1')} placeholder="123 Main St" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="City" value={basics.city} onChange={set('city')} placeholder="Austin" />
                <Field label="State" value={basics.state} onChange={set('state')} placeholder="TX" />
                <Field label="ZIP" value={basics.zip} onChange={set('zip')} placeholder="78701" />
              </div>
              <div className="sm:w-1/2">
                <Field
                  label="Target opening date"
                  value={basics.openingDate}
                  onChange={set('openingDate')}
                  type="date"
                />
              </div>
            </div>

            <p className="mb-2 mt-5 text-xs font-medium text-gray-700">Store type</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {packages.map((pkg) => {
                const active = pkg.format === format;
                const estimate = packageEstimate(pkg);
                return (
                  <button
                    key={pkg.format}
                    type="button"
                    onClick={() => chooseFormat(pkg.format)}
                    aria-pressed={active}
                    className={`relative rounded-xl border bg-white p-4 text-left transition-colors ${
                      active ? '' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={
                      active
                        ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 2px var(--color-brand)' }
                        : undefined
                    }
                  >
                    {active && (
                      <span
                        className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white"
                        style={{ background: 'var(--color-brand)' }}
                        aria-hidden
                      >
                        ✓
                      </span>
                    )}
                    <span className="block pr-6 text-sm font-semibold text-gray-900">{pkg.formatLabel || pkg.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{pkg.description}</span>
                    <span className="mt-2 block text-xs font-medium" style={{ color: 'var(--color-brand-dark)' }}>
                      {pkg.items.length}-sign standard package · {formatPrice(estimate.total)} est.
                      {estimate.custom > 0 && ` + ${estimate.custom} custom`}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        <Card title="Your contact details" hint="Who Signage.com and the brand reach about this order.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Your name" value={basics.requesterName} onChange={set('requesterName')} placeholder="Full name" />
            <Field
              label="Your email"
              value={basics.requesterEmail}
              onChange={set('requesterEmail')}
              placeholder="you@example.com"
              type="email"
            />
            <Field label="Your phone" value={basics.requesterPhone} onChange={set('requesterPhone')} placeholder="Optional" />
          </div>
        </Card>

        {/* §8b: financing is the norm, not an edge case. Asking here is what lets
            the team know a lender will need formal documents later. */}
        <Card
          title="Is a lender funding this store’s signage?"
          hint="Most franchisees fund signage with an SBA-style loan. If so, the budgetary quote, invoice and receipt your lender asks for are prepared with your order."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  aria-pressed={active}
                  onClick={() => setFinancing(option.value)}
                  className={`rounded-lg border py-2 text-sm transition-colors ${
                    active ? 'font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
        </Card>

        {/* §8b: landlord approval is TRACKED, never automated — a contact and the
            lease exhibit, nothing that promises an outcome. */}
        <Card
          title="Landlord and lease sign criteria (optional)"
          hint="Most leases include a sign exhibit setting what the landlord allows. Upload it and Signage.com checks your signs against it. Don’t have it yet? You can add it after you submit."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {!ready && (
          <p className="text-xs text-gray-500">
            {existing ? 'Loading…' : 'Add a store name and choose a store type to continue.'}
          </p>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!ready}
          className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
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

  const photos = items.filter((item) => item.photo).length;
  const priced = items.filter((item) => itemPrice(item, byId.get(item.brandItemId)) !== null);
  const total = priced.reduce((sum, item) => sum + (itemPrice(item, byId.get(item.brandItemId)) ?? 0), 0);

  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900">Your location requires these {items.length} signs</h1>
      <p className="mt-1 text-sm text-gray-500">
        The {formatLabel.toLowerCase()} standard package. Brand details are set; add a photo of where each sign
        goes and any site notes.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
        <span>
          <strong className="text-gray-900">{items.length}</strong> signs
        </span>
        <span>
          <strong className="text-gray-900">{formatPrice(total)}</strong> est.
          {items.length > priced.length && ` + ${items.length - priced.length} custom`}
        </span>
        <span>
          <strong className="text-gray-900">{photos}</strong> of {items.length} with photos
        </span>
        <span className="text-emerald-800">Approved automatically</span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const brandItem = byId.get(item.brandItemId);
          if (!brandItem) return null;
          const isOpen = open === item.key;
          const designed = Boolean(brandItem.design);

          return (
            <div
              key={item.key}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                item.exceptionIssue ? 'border-rose-200' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <SignThumbnail
                    renderKey={brandItem.render_key}
                    imagePath={brandItem.image_path}
                    label={brandItem.name}
                    className="h-10 w-14 shrink-0 rounded-md"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-900">
                      {brandItem.name}
                      <span className="text-xs font-normal text-gray-500">{formatPrice(itemPrice(item, brandItem))}</span>
                    </span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {item.design
                        ? `Customized: ${item.design.dimension.inches}" ${item.design.dimension.axis}`
                        : brandItem.spec_summary}
                      {item.exceptionIssue && <span className="text-rose-600"> · issue flagged</span>}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <PhotoState added={Boolean(item.photo)} />
                  <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
                </span>
              </button>

              {isOpen && (
                <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-4 pb-4 pt-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
                  <SignThumbnail
                    renderKey={brandItem.render_key}
                    imagePath={brandItem.image_path}
                    label={brandItem.name}
                    className="aspect-[4/3] w-full rounded-lg border border-gray-100 object-cover"
                  />
                  <div className="min-w-0 space-y-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-700">Photo of where it goes</p>
                      <PhotoUpload
                        label="Upload placement photo"
                        prefix={brand.slug}
                        value={item.photo}
                        onChange={(photo) => patch(item.key, { photo })}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-700">
                        {designed ? 'Site notes (optional)' : 'Size and site notes'}
                      </p>
                      <SizingField
                        value={item.sizing}
                        tbd={item.tbd}
                        onValueChange={(sizing) => patch(item.key, { sizing })}
                        onTbdChange={(tbd) => patch(item.key, { tbd })}
                        placeholder={designed ? 'e.g. centered above the entrance' : undefined}
                      />
                      {designed && (
                        <p className="mt-1 text-[11px] text-gray-500">The size comes from the design; change it in the Studio.</p>
                      )}
                    </div>
                    {hasAdjustableDesign(brandItem.design, brandItem.design_rules) && (
                      <StudioAdjust
                        brandSlug={brand.slug}
                        locationId={null}
                        brandItemId={brandItem.id}
                        signName={brandItem.name}
                        base={brandItem.design}
                        rules={brandItem.design_rules}
                        value={item.design}
                        onChange={(design) => patch(item.key, { design })}
                      />
                    )}

                    <div className="border-t border-gray-100 pt-3">
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
                          className="text-xs text-gray-500 transition-colors hover:text-rose-600"
                        >
                          ⚑ This standard sign won&rsquo;t work at my site
                        </button>
                      )}
                    </div>
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
        nextLabel={`Continue · ${photos} of ${items.length} with photos →`}
        hint={photos < items.length ? 'Photos are optional; you can add them after you submit.' : undefined}
      />
    </>
  );
}

/** On a collapsed sign row: whether its placement photo is in, without opening it. */
function PhotoState({ added }: { added: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        added ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
        <path d="M3 7h3l1.5-2h5L14 7h3v9H3z" />
        <circle cx="10" cy="11.5" r="2.6" />
      </svg>
      <span className="hidden sm:inline">{added ? 'Photo added' : 'Add photo'}</span>
      <span className="sr-only sm:hidden">{added ? 'Photo added' : 'No photo yet'}</span>
    </span>
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
      <h1 className="text-xl font-semibold text-gray-900">Anything beyond the standard package?</h1>
      <p className="mt-1 text-sm text-gray-500">Optional signs from the {brand.name} catalog. Pick any you need.</p>
      <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        {brand.name} approves add-ons before they are quoted. Your standard package isn&rsquo;t held up while they do.
      </p>

      {catalog.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          Every {brand.name} sign is already in your package.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          {catalog.map((item) => {
            const chosen = addons.find((addon) => addon.brandItemId === item.id);
            const policy = item.vendor_policy_override ?? brand.vendor_policy;
            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow ${chosen ? '' : 'border-gray-200'}`}
                style={chosen ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 1px var(--color-brand)' } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleAddon(item.id)}
                  aria-pressed={Boolean(chosen)}
                  aria-label={`${chosen ? 'Remove' : 'Add'} ${item.name}`}
                  className="block w-full text-left"
                >
                  <span className="relative block">
                    <SignThumbnail
                      renderKey={item.render_key}
                      imagePath={item.image_path}
                      label={item.name}
                      className="block aspect-[16/9] w-full object-cover"
                    />
                    <span
                      className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                        chosen ? 'border-transparent text-white' : 'border-gray-300 bg-white/90 text-transparent'
                      }`}
                      style={chosen ? { background: 'var(--color-brand)' } : undefined}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                      <span className="shrink-0 text-sm text-gray-700">{formatPrice(item.est_price)}</span>
                    </span>
                    {item.spec_summary && <span className="mt-0.5 block text-xs text-gray-500">{item.spec_summary}</span>}
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: chosen ? '#6B7280' : 'var(--color-brand-dark)' }}>
                        {chosen ? 'Added · click to remove' : '+ Add to my order'}
                      </span>
                      {policy !== 'signage_com' && (
                        <VendorChip policy={policy} vendorName={brand.vendor_name} brandPolicy={brand.vendor_policy} />
                      )}
                    </span>
                  </span>
                </button>
                {chosen && (
                  <div className="space-y-2 border-t border-gray-100 p-3">
                    <SizingField
                      siteVariables={item.site_variables}
                      value={chosen.sizing}
                      tbd={chosen.tbd}
                      onValueChange={(sizing) => patch(chosen.key, { sizing })}
                      onTbdChange={(tbd) => patch(chosen.key, { tbd })}
                    />
                    <PhotoUpload
                      compact
                      label="Add placement photo"
                      prefix={brand.slug}
                      value={chosen.photo}
                      onChange={(photo) => patch(chosen.key, { photo })}
                    />
                    {hasAdjustableDesign(item.design, item.design_rules) && (
                      <StudioAdjust
                        brandSlug={brand.slug}
                        locationId={null}
                        brandItemId={item.id}
                        signName={item.name}
                        base={item.design}
                        rules={item.design_rules}
                        value={chosen.design}
                        onChange={(design) => patch(chosen.key, { design })}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <StepNav onBack={onBack} onNext={onNext} nextLabel={addons.length ? 'Continue →' : 'No add-ons needed →'} />
    </>
  );
}

// ------------------------------------------------------------------ step four

function StepReview({
  brand,
  basics,
  existing,
  formatLabel,
  financing,
  landlord,
  leaseExhibit,
  items,
  byId,
  error,
  pending,
  onEdit,
  onBack,
  onSubmit,
}: {
  brand: BrandPublic;
  basics: Basics;
  existing: boolean;
  formatLabel: string;
  financing: boolean | null | undefined;
  landlord: { name: string; email: string; phone: string };
  leaseExhibit: StoredObject | null;
  items: ItemState[];
  byId: Map<string, BrandItemRow>;
  error: string | null;
  pending: boolean;
  onEdit: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  // A preview of the SPEC §7 split, under the standard model — the same
  // assumption docs/flow-demo.jsx makes. The server derives the real statuses
  // from the brand's approval_mode in deriveInitialItemStatus(); this is a
  // summary of what to expect, not the decision.
  const immediate = items.filter((item) => !goesToCorporate(item));
  const pendingItems = items.filter(goesToCorporate);
  const priced = items.filter((item) => itemPrice(item, byId.get(item.brandItemId)) !== null);
  const total = priced.reduce((sum, item) => sum + (itemPrice(item, byId.get(item.brandItemId)) ?? 0), 0);
  const external = brand.vendor_policy !== 'signage_com';
  const address = [basics.line1, basics.city, basics.state, basics.zip].filter(Boolean).join(', ');
  const landlordLine = [
    leaseExhibit && 'Lease exhibit attached',
    landlord.name.trim() && `Property manager: ${landlord.name.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900">Review and submit</h1>
      <p className="mt-1 text-sm text-gray-500">
        {basics.name || 'Your store'} · {items.length} signs. Check everything, then submit.
      </p>

      <div className="mt-5 space-y-4">
        <ReviewCard title="Store" onEdit={() => onEdit(1)}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Detail label="Store" value={basics.name || '—'} />
            <Detail label="Store type" value={formatLabel || '—'} />
            {!existing && <Detail label="Address" value={address || 'To confirm'} />}
            {!existing && <Detail label="Opening" value={basics.openingDate ? formatDate(basics.openingDate) : 'To confirm'} />}
            <Detail
              label="Contact"
              value={[basics.requesterName, basics.requesterEmail, basics.requesterPhone].filter(Boolean).join(' · ') || '—'}
            />
            <Detail
              label="Lender"
              value={financing === true ? 'A lender is involved' : financing === false ? 'No lender' : financing === null ? 'Not sure yet' : 'Not answered'}
            />
            <Detail label="Landlord" value={landlordLine || 'Not provided; Signage.com will follow up'} />
          </dl>
        </ReviewCard>

        <ReviewCard title={`Approved automatically (${immediate.length})`} onEdit={() => onEdit(2)}>
          <SignList items={immediate} byId={byId} />
        </ReviewCard>

        {pendingItems.length > 0 && (
          <ReviewCard
            title={`Needs ${brand.name} approval (${pendingItems.length})`}
            hint={`${brand.name} reviews these before they are quoted.`}
            tone="amber"
            onEdit={() => onEdit(3)}
          >
            <SignList items={pendingItems} byId={byId} />
          </ReviewCard>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Estimated total</h2>
            <span className="text-xl font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
              {formatPrice(total)}
            </span>
          </div>
          {items.length > priced.length && (
            <p className="mt-1 text-xs text-gray-500">
              + {items.length - priced.length} custom-quote item{items.length - priced.length === 1 ? '' : 's'}, priced
              by Signage.com after you submit
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            {external
              ? `Approved signs go to ${brand.vendor_name ?? 'the brand’s vendor'}, who prices them directly; these are Signage.com reference estimates.`
              : 'An estimate from the brand’s standard designs. The final price comes with your quote.'}
          </p>
        </section>

        <section className="rounded-xl bg-gray-50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900">What happens next</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-gray-600">
            <li>1. Signage.com prepares your package and checks it against your lease criteria.</li>
            {pendingItems.length > 0 && <li>2. {brand.name} reviews the signs that need approval.</li>}
            <li>
              {pendingItems.length > 0 ? 3 : 2}. You get a quote to accept; production and installation follow, with an
              email at each step.
            </li>
          </ol>
        </section>
      </div>

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

function ReviewCard({
  title,
  hint,
  tone,
  onEdit,
  children,
}: {
  title: string;
  hint?: string;
  tone?: 'amber';
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${tone === 'amber' ? 'border-amber-200' : 'border-gray-200'}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <button type="button" onClick={onEdit} className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--color-brand-dark)' }}>
          Edit
        </button>
      </div>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

function SignList({ items, byId }: { items: ItemState[]; byId: Map<string, BrandItemRow> }) {
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => {
        const brandItem = byId.get(item.brandItemId);
        if (!brandItem) return null;
        const detail = item.exceptionIssue
          ? `“${item.exceptionIssue}”`
          : item.design
            ? `Customized: ${item.design.dimension.inches}" ${item.design.dimension.axis}`
            : item.tbd
              ? 'Size TBD; the team will follow up'
              : item.sizing.trim() || brandItem.spec_summary || '';
        return (
          <li key={item.key} className="flex items-center gap-3 py-2">
            <SignThumbnail
              renderKey={brandItem.render_key}
              imagePath={brandItem.image_path}
              label={brandItem.name}
              className="h-10 w-14 shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-900">
                {brandItem.name}
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {item.fromPackage ? (item.exceptionIssue ? 'Exception' : 'Standard') : 'Add-on'}
                </span>
              </p>
              {detail && <p className={`truncate text-xs ${item.exceptionIssue ? 'text-rose-600' : 'text-gray-500'}`}>{detail}</p>}
            </div>
            <PhotoState added={Boolean(item.photo)} />
            <span className="w-16 shrink-0 text-right text-sm font-medium text-gray-900 sm:w-24">
              {formatPrice(itemPrice(item, brandItem))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// -------------------------------------------------------------------- shared

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  hint,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
      <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
        ← Back
      </button>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--color-brand)' }}
        >
          {nextLabel}
        </button>
      </div>
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
