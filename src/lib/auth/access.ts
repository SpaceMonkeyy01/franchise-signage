// Authorization: "what may this person do?" (SPEC v2.3 §10.1–10.2).
//
// Identity (./identity.ts) says who someone is. This says what they hold: their
// ACTIVE memberships, read fresh on every request so that deactivating one locks
// the person out on their next click rather than when a session expires — the
// property Session 6d proved for the allowlist, kept for every role.
//
// The database holds the same line (app.is_platform_admin, app.brand_role,
// app.can_see_location); the app connects as the table owner, so this file is
// the check that actually runs, and RLS is the backstop.

import { query, queryOne } from '../db/pool';
import { getIdentity, type Identity } from './identity';

export type MemberRole =
  | 'platform_admin'
  | 'brand_admin'
  | 'brand_reviewer'
  | 'franchisee_owner'
  | 'franchisee_staff';

export interface Membership {
  id: string;
  role: MemberRole;
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  franchiseeId: string | null;
  /** The brand requires two-factor of its admins and reviewers (§10.7 D8). */
  brandRequiresTwoFactor: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export interface Viewer {
  identity: Identity;
  profile: Profile;
  memberships: Membership[];
}

/** A Signage.com session lasts 12 hours from the password (§10.3.3). */
export const PLATFORM_SESSION_HOURS = 12;

/**
 * The signed-in person, their profile and their active memberships — or null.
 *
 * An identity with no profile is treated as signed out: it can only arise from
 * an acceptance that failed half-way, and a person with no profile holds nothing.
 */
export async function getViewer(): Promise<Viewer | null> {
  const identity = await getIdentity();
  if (!identity) return null;

  const profile = await queryOne<Profile>(
    `select id, email, name, phone from profiles where id = $1`,
    [identity.userId],
  );
  if (!profile) return null;

  return { identity, profile, memberships: await membershipsFor(profile.id) };
}

/** A profile's ACTIVE memberships, read fresh — never cached across requests. */
export async function membershipsFor(profileId: string): Promise<Membership[]> {
  const rows = await query<{
    id: string;
    role: MemberRole;
    brand_id: string | null;
    brand_slug: string | null;
    brand_name: string | null;
    franchisee_id: string | null;
    require_two_factor: boolean | null;
  }>(
    `select m.id, m.role, m.brand_id, b.slug as brand_slug, b.name as brand_name,
            m.franchisee_id, b.require_two_factor
       from memberships m left join brands b on b.id = m.brand_id
      where m.profile_id = $1 and m.active
      order by m.role, b.name`,
    [profileId],
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    brandId: row.brand_id,
    brandSlug: row.brand_slug,
    brandName: row.brand_name,
    franchiseeId: row.franchisee_id,
    brandRequiresTwoFactor: Boolean(row.require_two_factor),
  }));
}

export function platformMembership(viewer: Viewer): Membership | null {
  return viewer.memberships.find((m) => m.role === 'platform_admin') ?? null;
}

/**
 * Whether this person must pass a second factor before anything opens.
 *
 * Always for Signage.com; for a brand's admins and reviewers when that brand has
 * switched it on (§10.7 D8). Franchisees are never forced.
 */
export function requiresSecondFactor(memberships: Membership[]): boolean {
  return memberships.some(
    (m) =>
      m.role === 'platform_admin' ||
      (m.brandRequiresTwoFactor && (m.role === 'brand_admin' || m.role === 'brand_reviewer')),
  );
}

/** True when the second factor is owed and not yet passed in this session. */
export function owesSecondFactor(viewer: Viewer): boolean {
  return requiresSecondFactor(viewer.memberships) && viewer.identity.aal !== 'aal2';
}

export function platformSessionExpired(viewer: Viewer, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - viewer.identity.authenticatedAt.getTime();
  return ageMs > PLATFORM_SESSION_HOURS * 60 * 60 * 1000;
}

/**
 * Where a person goes after signing in, when nothing asked for somewhere else.
 *
 * Phase A gives only Signage.com a destination of its own; brand and franchisee
 * homes arrive with phases B and C, and until then they land on their brand.
 */
export function homeFor(memberships: Membership[]): string {
  if (memberships.some((m) => m.role === 'platform_admin')) return '/admin';
  const first = memberships[0];
  if (first?.brandSlug) return `/${first.brandSlug}`;
  return '/';
}

/** A same-origin path, or the fallback. `next` arrives in URLs, so it is never trusted. */
export function safeNext(requested: string | null | undefined, fallback: string): string {
  if (!requested) return fallback;
  return requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
    ? requested
    : fallback;
}
