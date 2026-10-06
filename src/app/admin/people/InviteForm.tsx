'use client';

// The team's one invitation form (DECISIONS #190). The account type decides
// what else it asks: a brand for everyone but a Signage.com admin, a name for
// a franchisee owner, and the company and stores for a store manager.

import { useState, useTransition } from 'react';

import { inviteSomeoneAction, type InviteDone, type InviteRole } from './actions';

export interface Company {
  id: string;
  name: string;
  stores: { id: string; name: string }[];
}

const ROLES: { value: InviteRole; label: string; hint: string }[] = [
  { value: 'brand_admin', label: 'Brand admin', hint: 'Manages the brand’s signs, packages and people.' },
  { value: 'brand_reviewer', label: 'Brand reviewer', hint: 'Approves add-ons and exceptions.' },
  { value: 'franchisee_owner', label: 'Franchisee owner', hint: 'Owns stores; gets the brand’s welcome email.' },
  { value: 'franchisee_staff', label: 'Store manager', hint: 'Orders for chosen stores of one franchisee.' },
  { value: 'platform_admin', label: 'Signage.com admin', hint: 'Full access to this console.' },
];

const field = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm';

export function InviteForm({
  brands,
  companies,
}: {
  brands: { id: string; name: string }[];
  companies: Record<string, Company[]>;
}) {
  const [role, setRole] = useState<InviteRole>('brand_admin');
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InviteDone | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const needsBrand = role !== 'platform_admin';
  const brandCompanies = companies[brandId] ?? [];
  const company = brandCompanies.find((c) => c.id === companyId) ?? null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(null);
    setCopied(false);
    startTransition(async () => {
      const result = await inviteSomeoneAction({
        role,
        brandId: needsBrand ? brandId : null,
        email,
        name,
        franchiseeId: role === 'franchisee_staff' ? companyId || null : null,
        locationIds: role === 'franchisee_staff' ? storeIds : [],
      });
      if ('error' in result) setError(result.error);
      else {
        setSent(result);
        setEmail('');
        setName('');
        setStoreIds([]);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
      <h2 className="text-sm font-semibold text-gray-900">Invite someone</h2>

      <fieldset>
        <legend className="text-xs font-medium text-gray-700">Account type</legend>
        <div className="mt-1.5 space-y-1.5">
          {ROLES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${
                role === option.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {needsBrand && (
        <label className="block text-xs font-medium text-gray-700">
          Brand
          <select
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setCompanyId('');
              setStoreIds([]);
            }}
            className={field}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {role === 'franchisee_staff' && (
        <>
          <label className="block text-xs font-medium text-gray-700">
            Franchisee company
            <select
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setStoreIds([]);
              }}
              className={field}
            >
              <option value="">Choose…</option>
              {brandCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {brandCompanies.length === 0 && (
              <span className="mt-1 block text-xs font-normal text-gray-500">This brand has no franchisee companies yet. Invite an owner first.</span>
            )}
          </label>
          {company && (
            <fieldset>
              <legend className="text-xs font-medium text-gray-700">Stores they may order for</legend>
              <div className="mt-1.5 space-y-1">
                {company.stores.map((store) => (
                  <label key={store.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={storeIds.includes(store.id)}
                      onChange={(event) =>
                        setStoreIds((ids) => (event.target.checked ? [...ids, store.id] : ids.filter((id) => id !== store.id)))
                      }
                    />
                    {store.name}
                  </label>
                ))}
                {company.stores.length === 0 && <p className="text-xs text-gray-500">This company has no stores yet.</p>}
              </div>
            </fieldset>
          )}
        </>
      )}

      <label className="block text-xs font-medium text-gray-700">
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className={field} />
      </label>
      {role === 'franchisee_owner' && (
        <label className="block text-xs font-medium text-gray-700">
          Name <span className="font-normal text-gray-500">(optional)</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className={field} />
        </label>
      )}

      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {pending ? 'Sending…' : 'Send invitation'}
      </button>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {sent && (
        <div className="space-y-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <p>Invitation sent to {sent.sentTo}.</p>
          {sent.warning && <p className="text-xs text-amber-800">{sent.warning}</p>}
          {sent.url && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-gray-700">{sent.url}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(sent.url!).then(() => setCopied(true));
                }}
                className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200"
              >
                {copied ? 'Copied' : 'Copy invitation link'}
              </button>
            </div>
          )}
          {sent.url && <p className="text-xs text-emerald-800">If email is not set up, send them this link yourself.</p>}
        </div>
      )}
    </form>
  );
}
