'use client';

// Every franchisee company in the brand, and its people (SPEC v2.3 §10.2).
//
// A brand admin sees each company's owners and store staff, and manages them:
// owners are deactivated or reactivated here (they arrive by the §8d
// registration, which this section offers as well as the Dashboard), and staff
// are managed with the same
// screen their owner uses at /staff (DECISIONS #140). Deactivating takes effect
// on the person's next click.

import { useState, useTransition } from 'react';

import type { RegistrationWithBrand } from '@/lib/db/queries';
import type { FranchiseeOwner, FranchiseePeople } from '@/lib/staff';

import { StaffManager } from '../staff/StaffManager';
import { setFranchiseeOwnerActiveAction } from './actions';
import { Registrations } from './Registrations';

type OwnerRow = FranchiseeOwner;
type FranchiseeRow = FranchiseePeople;

export function Franchisees({
  brandSlug,
  brandName,
  franchisees,
  registrations,
}: {
  brandSlug: string;
  brandName: string;
  franchisees: FranchiseeRow[];
  registrations: RegistrationWithBrand[];
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900">Franchisees</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
        Each franchisee company, its owners and its store staff. A company appears here once its
        owner accepts the invitation in their welcome email.
      </p>
      <Registrations
        brandSlug={brandSlug}
        brandName={brandName}
        registrations={registrations}
        embedded
      />
      <div className="mt-3 space-y-3">
        {franchisees.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
            No franchisee companies yet.
          </p>
        )}
        {franchisees.map((company) => (
          <Company key={company.id} brandSlug={brandSlug} company={company} />
        ))}
      </div>
    </section>
  );
}

function Company({ brandSlug, company }: { brandSlug: string; company: FranchiseeRow }) {
  const [open, setOpen] = useState(false);
  const activeStaff = company.staff.filter((member) => member.active).length;

  return (
    <div data-franchisee={company.name} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">{company.name}</span>
        <span className="text-xs text-gray-500">
          {plural(company.stores.length, 'store')} · {plural(company.owners.length, 'owner')} ·{' '}
          {plural(activeStaff, 'staff member', 'staff members')}
          {company.invitations.length > 0 && ` · ${company.invitations.length} invited`}
        </span>
        <span className="ml-auto text-xs text-gray-500" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <h4 className="text-sm font-semibold text-gray-900">Owners</h4>
          <div className="mt-2 space-y-2">
            {company.owners.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                No owner account yet — the welcome email carries their invitation.
              </p>
            )}
            {company.owners.map((owner) => (
              <Owner key={owner.membershipId} brandSlug={brandSlug} owner={owner} />
            ))}
          </div>

          {company.stores.length === 0 ? (
            <p className="mt-4 text-xs text-gray-500">
              No stores yet, so there is nothing to give staff access to.
            </p>
          ) : (
            <StaffManager
              brandSlug={brandSlug}
              franchiseeId={company.id}
              stores={company.stores}
              members={company.staff}
              invitations={company.invitations}
              compact
            />
          )}
        </div>
      )}
    </div>
  );
}

function Owner({ brandSlug, owner }: { brandSlug: string; owner: OwnerRow }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = () => {
    if (
      owner.active &&
      !window.confirm(
        `Deactivate ${owner.email}? They lose access on their next click, and nobody else at their company can accept quotes until an owner is active again.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const failure = await setFranchiseeOwnerActiveAction(brandSlug, owner.membershipId, !owner.active);
      if (failure) setError(failure.error);
    });
  };

  return (
    <div
      data-owner={owner.email}
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
        owner.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{owner.name ?? owner.email}</p>
        <p className="text-xs text-gray-500">
          {owner.email} · Owner
          {!owner.active && ' · deactivated'}
        </p>
      </div>
      {error && <span className="text-xs text-rose-700">{error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 ${
          owner.active ? 'text-rose-700' : 'text-gray-600'
        }`}
      >
        {pending ? '…' : owner.active ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
