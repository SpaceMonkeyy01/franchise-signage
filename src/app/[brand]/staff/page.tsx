// Store staff (SPEC v2.3 §10.2, phase D of §9b).
//
// The owner of a franchisee company invites store managers and chooses which
// of the company's stores each one sees. Staff order and answer change requests
// for their stores; they do not accept quotes or set up new stores (§10.2,
// §10.7 D1–D2). Deactivating, or taking a store away, takes effect on the
// staff member's next click — their scope is read fresh on every request.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountBadge } from '@/components/AccountBadge';
import { BrandHeader, BrandTheme } from '@/components/BrandChrome';
import { requireOwner } from '@/lib/auth/stores';
import { getBrandBySlug } from '@/lib/db/queries';
import { companyStaff, companyStaffInvitations, companyStores } from '@/lib/staff';

import { StaffManager } from './StaffManager';

export const dynamic = 'force-dynamic';

export default async function StaffPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const owner = await requireOwner(slug);
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const [stores, members, invitations] = await Promise.all([
    companyStores(owner.franchiseeId),
    companyStaff(owner.franchiseeId),
    companyStaffInvitations(owner.franchiseeId),
  ]);

  return (
    <>
      <BrandTheme brand={brand} />
      <BrandHeader
        brand={brand}
        backHref={`/${slug}`}
        account={<AccountBadge name={owner.viewer.profile.name} email={owner.viewer.profile.email} />}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-gray-900">Store staff</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
          Invite your store managers and choose which stores each one sees. They can order signage
          and answer change requests for those stores. Accepting a quote, and setting up a new
          store, stay with you.
        </p>

        {stores.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            You have no stores yet, so there is nothing to give staff access to.{' '}
            <Link href={`/${slug}/setup`} className="underline underline-offset-2">
              Set up your first store
            </Link>
            .
          </p>
        ) : (
          <StaffManager
            brandSlug={slug}
            stores={stores}
            members={members}
            invitations={invitations}
          />
        )}
      </main>
    </>
  );
}
