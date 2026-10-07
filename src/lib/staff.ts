// Store staff management (SPEC v2.3 §10.2 "invite or deactivate store staff").
//
// Two people may do this, over different reaches: a franchisee owner, over
// their own company, and a brand admin (or Signage.com), over every franchisee
// company in the brand (DECISIONS #140). Both screens call these, so the rules
// live once: every function is scoped by the franchisee company, and every store
// id and membership id it is handed must belong to that company — the form
// having offered only those is not the check. Callers decide who may act on
// which company; these decide nothing about the caller.
//
// Each returns a sentence for the person when the change is refused, and
// nothing when it is made.

import { createInvitation, revokeInvitation } from './auth/invitations';
import { query, queryOne, transaction } from './db/pool';

export interface StaffScope {
  brand: { id: string; name: string };
  franchiseeId: string;
}

export interface StaffStore {
  id: string;
  name: string;
}

export interface StaffMember {
  membershipId: string;
  email: string;
  name: string | null;
  active: boolean;
  locationIds: string[];
}

export interface StaffInvite {
  id: string;
  email: string;
  locationIds: string[];
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

// ---------------------------------------------------------------------- reads

export function companyStores(franchiseeId: string): Promise<StaffStore[]> {
  return query<StaffStore>(
    `select id, name from locations where franchisee_id = $1 order by created_at`,
    [franchiseeId],
  );
}

export function companyStaff(franchiseeId: string): Promise<StaffMember[]> {
  return query<StaffMember>(
    `select m.id as "membershipId", p.email, p.name, m.active,
            coalesce(array_agg(ml.location_id::text) filter (where ml.location_id is not null), '{}')
              as "locationIds"
       from memberships m
       join profiles p on p.id = m.profile_id
       left join membership_locations ml on ml.membership_id = m.id
      where m.franchisee_id = $1 and m.role = 'franchisee_staff'
      group by m.id, p.email, p.name, m.active
      order by m.active desc, p.email`,
    [franchiseeId],
  );
}

export function companyStaffInvitations(franchiseeId: string): Promise<StaffInvite[]> {
  return query<StaffInvite>(
    `select id, email, location_ids::text[] as "locationIds", created_at as "createdAt",
            expires_at as "expiresAt", expires_at <= now() as expired
       from invitations
      where franchisee_id = $1 and role = 'franchisee_staff'
        and accepted_at is null and revoked_at is null
      order by created_at desc`,
    [franchiseeId],
  );
}

export interface FranchiseeOwner {
  membershipId: string;
  email: string;
  name: string | null;
  active: boolean;
}

export interface FranchiseePeople {
  id: string;
  name: string;
  /** False when Signage.com has deactivated the company (#200). */
  active: boolean;
  owners: FranchiseeOwner[];
  stores: StaffStore[];
  staff: StaffMember[];
  invitations: StaffInvite[];
}

/** Every franchisee company in a brand with its people — the corporate People tab. */
export async function brandFranchiseePeople(brandId: string): Promise<FranchiseePeople[]> {
  const [companies, owners, stores, staff, invitations] = await Promise.all([
    query<{ id: string; name: string; active: boolean }>(
      `select id, name, active from franchisees where brand_id = $1 order by name`,
      [brandId],
    ),
    query<FranchiseeOwner & { franchiseeId: string }>(
      `select m.franchisee_id as "franchiseeId", m.id as "membershipId", p.email, p.name, m.active
         from memberships m join profiles p on p.id = m.profile_id
        where m.brand_id = $1 and m.role = 'franchisee_owner'
        order by m.active desc, p.email`,
      [brandId],
    ),
    query<StaffStore & { franchiseeId: string }>(
      `select l.franchisee_id as "franchiseeId", l.id, l.name
         from locations l join franchisees f on f.id = l.franchisee_id
        where f.brand_id = $1
        order by l.created_at`,
      [brandId],
    ),
    query<StaffMember & { franchiseeId: string }>(
      `select m.franchisee_id as "franchiseeId", m.id as "membershipId", p.email, p.name, m.active,
              coalesce(array_agg(ml.location_id::text) filter (where ml.location_id is not null), '{}')
                as "locationIds"
         from memberships m
         join profiles p on p.id = m.profile_id
         left join membership_locations ml on ml.membership_id = m.id
        where m.brand_id = $1 and m.role = 'franchisee_staff'
        group by m.franchisee_id, m.id, p.email, p.name, m.active
        order by m.active desc, p.email`,
      [brandId],
    ),
    query<StaffInvite & { franchiseeId: string }>(
      `select franchisee_id as "franchiseeId", id, email, location_ids::text[] as "locationIds",
              created_at as "createdAt", expires_at as "expiresAt", expires_at <= now() as expired
         from invitations
        where brand_id = $1 and role = 'franchisee_staff'
          and accepted_at is null and revoked_at is null
        order by created_at desc`,
      [brandId],
    ),
  ]);

  const of = <T extends { franchiseeId: string }>(rows: T[], id: string) =>
    rows.filter((row) => row.franchiseeId === id);

  return companies.map((company) => ({
    ...company,
    owners: of(owners, company.id),
    stores: of(stores, company.id),
    staff: of(staff, company.id),
    invitations: of(invitations, company.id),
  }));
}

/** Whether the company is one of the brand's — what a brand admin's reach is. */
export async function franchiseeOnBrand(franchiseeId: string, brandId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from franchisees where id = $1 and brand_id = $2`,
    [franchiseeId, brandId],
  );
  return Boolean(row);
}

// --------------------------------------------------------------------- writes

/** A sentence when any id is not one of the company's stores, else null. */
async function notCompanyStores(locationIds: string[], franchiseeId: string): Promise<string | null> {
  const unique = [...new Set(locationIds)];
  if (unique.length === 0) return 'Choose at least one store.';
  const found = await query<{ id: string }>(
    `select id from locations where id = any($1::uuid[]) and franchisee_id = $2`,
    [unique, franchiseeId],
  );
  return found.length === unique.length ? null : 'That store is not one of this franchisee’s.';
}

async function staffOfCompany(membershipId: string, franchiseeId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships
      where id = $1 and role = 'franchisee_staff' and franchisee_id = $2`,
    [membershipId, franchiseeId],
  );
  return Boolean(row);
}

export async function inviteStaff(
  scope: StaffScope,
  input: { email: string; locationIds: string[]; invitedBy: string; inviterName: string },
): Promise<{ sentTo: string; warning: string | null; url: string } | { error: string }> {
  const address = input.email.trim();
  const stores = await notCompanyStores(input.locationIds, scope.franchiseeId);
  if (stores) return { error: stores };

  // One staff role per person per brand (the memberships index). Someone who
  // already has it here is reactivated or re-assigned, not invited; someone
  // who has it at ANOTHER franchisee belongs to that company.
  const existing = await queryOne<{ franchisee_id: string; active: boolean }>(
    `select m.franchisee_id, m.active from memberships m join profiles p on p.id = m.profile_id
      where lower(p.email) = lower($1) and m.brand_id = $2 and m.role = 'franchisee_staff'`,
    [address, scope.brand.id],
  );
  if (existing && existing.franchisee_id !== scope.franchiseeId) {
    return { error: `${address} is already staff at another ${scope.brand.name} franchisee.` };
  }
  if (existing?.active) return { error: `${address} is already on staff. Change their stores below.` };
  if (existing) return { error: `${address} was deactivated. Reactivate them below instead.` };

  const minted = await createInvitation({
    brandId: scope.brand.id,
    email: address,
    role: 'franchisee_staff',
    franchiseeId: scope.franchiseeId,
    locationIds: [...new Set(input.locationIds)],
    invitedBy: input.invitedBy,
    inviterName: input.inviterName,
  });
  return { sentTo: address, warning: minted.domainWarning, url: minted.url };
}

/** Replace a staff member's stores. Takes effect on their next click. */
export async function setStaffStores(
  franchiseeId: string,
  membershipId: string,
  locationIds: string[],
): Promise<string | void> {
  if (!(await staffOfCompany(membershipId, franchiseeId))) return 'That person is not on this staff.';
  const stores = await notCompanyStores(locationIds, franchiseeId);
  if (stores) return stores;
  await transaction(async (tx) => {
    await tx.query(`delete from membership_locations where membership_id = $1`, [membershipId]);
    for (const locationId of new Set(locationIds)) {
      await tx.query(
        `insert into membership_locations (membership_id, location_id) values ($1, $2)`,
        [membershipId, locationId],
      );
    }
  });
}

export async function setStaffActive(
  franchiseeId: string,
  membershipId: string,
  active: boolean,
): Promise<string | void> {
  if (!(await staffOfCompany(membershipId, franchiseeId))) return 'That person is not on this staff.';
  await query(
    `update memberships set active = $2, deactivated_at = case when $2 then null else now() end
      where id = $1`,
    [membershipId, active],
  );
}

export async function withdrawStaffInvitation(
  franchiseeId: string,
  invitationId: string,
): Promise<string | void> {
  const owned = await queryOne<{ id: string }>(
    `select id from invitations
      where id = $1 and role = 'franchisee_staff' and franchisee_id = $2`,
    [invitationId, franchiseeId],
  );
  if (!owned) return 'That invitation is not one of this franchisee’s.';
  await revokeInvitation(invitationId);
}
