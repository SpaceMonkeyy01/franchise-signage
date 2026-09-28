// Guards for the corporate dashboard (SPEC v2.3 §10.2, phase C).
//
// The dashboard used to open from a 30-day emailed link that could read and
// never decide (DECISIONS #75). It sits behind sign-in now, and what a person
// may do there is their role on the brand:
//
//   brand_reviewer — read the program; approve, decline, request changes;
//                    export the budget one-pager.
//   brand_admin    — all of that (§10.7 D3), and invite franchisees, and invite
//                    and deactivate the brand's admins and reviewers.
//   platform_admin — all of it, on every brand.
//
// Same shape as ./stores.ts: pages call `require*`, which redirects a signed-out
// visitor to sign in and answers 404 to anyone without a corporate role; Server
// Actions call `check*`, which returns a sentence, because an action is
// reachable by direct POST and must decide for itself.

import { notFound } from 'next/navigation';

import { getBrandBySlug, type BrandPublic } from '../db/queries';
import { getViewer, owesSecondFactor, platformMembership, type Membership, type Viewer } from './access';
import { requireViewer } from './stores';

export type CorporateRole = 'platform_admin' | 'brand_admin' | 'brand_reviewer';

export interface CorporateAccess {
  viewer: Viewer;
  brand: BrandPublic;
  role: CorporateRole;
  /** The membership the caller acts through — recorded as `invited_by`. */
  membership: Membership;
  /** Invite franchisees and manage the brand's people (§10.2). */
  canManage: boolean;
}

function corporateAccess(viewer: Viewer, brand: BrandPublic): CorporateAccess | null {
  const platform = platformMembership(viewer);
  if (platform) {
    return { viewer, brand, role: 'platform_admin', membership: platform, canManage: true };
  }
  const onBrand = viewer.memberships.filter((m) => m.brandId === brand.id);
  const admin = onBrand.find((m) => m.role === 'brand_admin');
  if (admin) return { viewer, brand, role: 'brand_admin', membership: admin, canManage: true };
  const reviewer = onBrand.find((m) => m.role === 'brand_reviewer');
  if (reviewer) {
    return { viewer, brand, role: 'brand_reviewer', membership: reviewer, canManage: false };
  }
  return null;
}

/** The dashboard's page guard. */
export async function requireCorporate(brandSlug: string, next: string): Promise<CorporateAccess> {
  const viewer = await requireViewer(next);
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();
  const access = corporateAccess(viewer, brand);
  if (!access) notFound();
  return access;
}

/** Whether the signed-in viewer is corporate on this brand, without redirecting. */
export async function corporateAccessFor(brandSlug: string): Promise<CorporateAccess | null> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return null;
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) return null;
  return corporateAccess(viewer, brand);
}

export type CheckedCorporate = CorporateAccess | { error: string };

/** The action-side guard. `manage` asks for a brand admin (or Signage.com). */
export async function checkCorporate(
  brandSlug: string,
  { manage = false }: { manage?: boolean } = {},
): Promise<CheckedCorporate> {
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) {
    return { error: 'Your session has ended. Sign in again, then retry.' };
  }
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) return { error: 'Unknown brand.' };
  const access = corporateAccess(viewer, brand);
  if (!access) return { error: `Your account has no ${brand.name} corporate role.` };
  if (manage && !access.canManage) {
    return { error: `Only a ${brand.name} brand admin can do that.` };
  }
  return access;
}
