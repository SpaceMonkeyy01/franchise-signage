// Guards for the franchisee's store screens (SPEC v2.3 §10.2, phase B).
//
// Pages call the `require*` forms, which redirect a signed-out visitor to sign
// in and answer 404 to anyone signed in who holds no scope on the store — the
// same "that link did not open anything" every other miss in this build gets.
// Server Actions call the `check*` forms, which return a sentence instead,
// because an action is reachable by direct POST and must decide for itself.

import { notFound, redirect } from 'next/navigation';

import { queryOne } from '../db/pool';
import {
  getViewer,
  owesSecondFactor,
  scopeCoversLocation,
  storeScope,
  type StoreScope,
  type Viewer,
} from './access';

interface BrandRef {
  id: string;
  slug: string;
}

async function brandBySlug(slug: string): Promise<BrandRef | null> {
  return queryOne<BrandRef>(`select id, slug from brands where slug = $1`, [slug]);
}

function signInFor(next: string): never {
  redirect(`/sign-in?next=${encodeURIComponent(next)}`);
}

/** A signed-in viewer for a page at `next`, having passed any second factor they owe. */
export async function requireViewer(next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) signInFor(next);
  if (owesSecondFactor(viewer)) redirect(`/two-factor?next=${encodeURIComponent(next)}`);
  return viewer;
}

/** A page that orders for one store: the intent picker, add, replace. */
export async function requireStoreOrdering(
  brandSlug: string,
  locationId: string,
  next: string,
): Promise<{ viewer: Viewer; scope: StoreScope }> {
  const viewer = await requireViewer(next);
  const brand = await brandBySlug(brandSlug);
  if (!brand) notFound();
  const scope = await storeScope(viewer, brand.id);
  if (scope.kind === 'none' || !scope.canOrder) notFound();
  if (!(await scopeCoversLocation(scope, locationId))) notFound();
  return { viewer, scope };
}

/** Starting a new store: owners, and Signage.com. */
export async function requireStoreCreation(
  brandSlug: string,
): Promise<{ viewer: Viewer; scope: StoreScope }> {
  const viewer = await requireViewer(`/${brandSlug}/setup`);
  const brand = await brandBySlug(brandSlug);
  if (!brand) notFound();
  const scope = await storeScope(viewer, brand.id);
  if (scope.kind === 'none' || !scope.canCreateStore) notFound();
  return { viewer, scope };
}

export type Checked = { viewer: Viewer; scope: StoreScope } | { error: string };

const SIGNED_OUT = 'Your session has ended. Sign in again, then retry.';

export async function checkStoreOrdering(brandSlug: string, locationId: string): Promise<Checked> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return { error: SIGNED_OUT };
  const brand = await brandBySlug(brandSlug);
  if (!brand) return { error: 'Unknown brand.' };
  const scope = await storeScope(viewer, brand.id);
  if (scope.kind === 'none' || !scope.canOrder || !(await scopeCoversLocation(scope, locationId))) {
    return { error: 'Your account cannot order signage for this store.' };
  }
  return { viewer, scope };
}

export async function checkStoreCreation(brandSlug: string): Promise<Checked> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return { error: SIGNED_OUT };
  const brand = await brandBySlug(brandSlug);
  if (!brand) return { error: 'Unknown brand.' };
  const scope = await storeScope(viewer, brand.id);
  if (scope.kind === 'none' || !scope.canCreateStore) {
    return { error: 'Only the owner of a franchisee account can set up a new store.' };
  }
  return { viewer, scope };
}

/**
 * Whether the signed-in viewer may accept quotes on this store (§10.2, §10.7 D1).
 * Owners and Signage.com; never a request link on its own, and never staff.
 */
export async function acceptQuoteAccess(
  locationId: string,
): Promise<'allowed' | 'signed_out' | 'not_owner'> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return 'signed_out';
  const brand = await queryOne<{ brand_id: string }>(
    `select brand_id from locations where id = $1`,
    [locationId],
  );
  if (!brand) return 'not_owner';
  const scope = await storeScope(viewer, brand.brand_id);
  if (scope.kind === 'none' || !scope.canAcceptQuotes) return 'not_owner';
  return (await scopeCoversLocation(scope, locationId)) ? 'allowed' : 'not_owner';
}

// ------------------------------------------------------------ store staff
// Phase D (§10.2 "invite or deactivate store staff: own stores"). The owner of
// a franchisee company manages that company's staff here. A brand admin manages
// every company's, from the corporate People tab (DECISIONS #140).

export interface OwnerAccess {
  viewer: Viewer;
  brand: BrandRef & { name: string };
  /** The owner's membership — recorded as `invited_by`. */
  membershipId: string;
  franchiseeId: string;
}

function ownerOf(viewer: Viewer, brandId: string) {
  return viewer.memberships.find(
    (m) => m.brandId === brandId && m.role === 'franchisee_owner' && m.franchiseeId,
  );
}

async function brandWithName(slug: string) {
  return queryOne<BrandRef & { name: string }>(`select id, slug, name from brands where slug = $1`, [
    slug,
  ]);
}

export async function requireOwner(brandSlug: string): Promise<OwnerAccess> {
  const viewer = await requireViewer(`/${brandSlug}/staff`);
  const brand = await brandWithName(brandSlug);
  if (!brand) notFound();
  const owner = ownerOf(viewer, brand.id);
  if (!owner?.franchiseeId) notFound();
  return { viewer, brand, membershipId: owner.id, franchiseeId: owner.franchiseeId };
}

export async function checkOwner(brandSlug: string): Promise<OwnerAccess | { error: string }> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return { error: SIGNED_OUT };
  const brand = await brandWithName(brandSlug);
  if (!brand) return { error: 'Unknown brand.' };
  const owner = ownerOf(viewer, brand.id);
  if (!owner?.franchiseeId) {
    return { error: 'Only the owner of a franchisee account can manage store staff.' };
  }
  return { viewer, brand, membershipId: owner.id, franchiseeId: owner.franchiseeId };
}
