// The dev identity provider's storage — DEV DATABASE ONLY.
//
// Kept apart from identity.ts so the dev database server can seed an account
// without importing `next/headers`. Nothing here is a migration: the `dev_auth`
// schema is created on demand in the dev database and never exists on Supabase,
// where Supabase Auth holds passwords and factors instead.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const DEV_AUTH_SCHEMA = `
  create schema if not exists dev_auth;
  create table if not exists dev_auth.users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null,
    password_hash text not null,
    created_at    timestamptz not null default now()
  );
  create unique index if not exists dev_auth_users_email on dev_auth.users (lower(email));
  create table if not exists dev_auth.sessions (
    token_hash       text primary key,
    user_id          uuid not null references dev_auth.users (id) on delete cascade,
    aal              text not null default 'aal1',
    authenticated_at timestamptz not null default now(),
    expires_at       timestamptz not null
  );
  create table if not exists dev_auth.factors (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references dev_auth.users (id) on delete cascade,
    secret      text not null,
    verified_at timestamptz,
    created_at  timestamptz not null default now()
  );
`;

/**
 * The seeded Signage.com account, so `npm run dev` can be signed into at once.
 *
 * Its password and authenticator secret are published here on purpose: it
 * exists only in a database on this machine, the dev provider refuses to run in
 * production, and the smoke suite has to be able to type both. Every other
 * account is created the real way, by invitation.
 */
export const DEV_ADMIN = {
  email: 'team@signage.com',
  name: 'Signage.com Team',
  password: 'signage-dev-password',
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
} as const;

/**
 * The pilot franchisee's owner (SPEC v2.3 §10.6) — Dana, who submitted every
 * demo request. Dev only, like DEV_ADMIN; no second factor, because franchisees
 * are never forced to use one (§10.7 D8).
 */
export const DEV_FRANCHISEE = {
  email: 'dana@freshbites-austin.com',
  name: 'Dana Whitfield',
  password: 'franchisee-dev-password',
} as const;

/**
 * A store manager at Freshbites Austin, assigned to Oak Plaza only — §9b phase
 * D's demo is "a manager sees one store of two". Dev only; on a real project the
 * owner invites staff from their Store staff page.
 */
export const DEV_STAFF = {
  email: 'riley@freshbites-austin.com',
  name: 'Riley Chen',
  password: 'staff-dev-password',
  store: 'Freshbites — Oak Plaza',
} as const;

/**
 * The pilot brand's corporate people (SPEC v2.3 §10.6): a brand admin at the
 * address the brand was configured with, and a reviewer. Dev only, like the
 * others; on a real project they come from `npm run invite -- <email>
 * --role brand_admin --brand freshbites`.
 */
export const DEV_BRAND_ADMIN = {
  email: 'brand@freshbites.com',
  name: 'Morgan Ellis',
  password: 'corporate-dev-password',
} as const;

export const DEV_BRAND_REVIEWER = {
  email: 'reviewer@freshbites.com',
  name: 'Jordan Reyes',
  password: 'reviewer-dev-password',
} as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function passwordMatches(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

/** A dev identity and its profile; returns the id. Idempotent. */
async function ensureDevAccount(
  db: Db,
  account: { email: string; name: string; password: string; totpSecret?: string },
): Promise<string> {
  await db.exec(DEV_AUTH_SCHEMA);

  const existing = await db.query<{ id: string }>(
    `select id from dev_auth.users where lower(email) = lower($1)`,
    [account.email],
  );
  let userId = existing.rows[0]?.id;
  if (!userId) {
    const created = await db.query<{ id: string }>(
      `insert into dev_auth.users (email, password_hash) values ($1, $2) returning id`,
      [account.email, hashPassword(account.password)],
    );
    userId = created.rows[0].id;
    if (account.totpSecret) {
      await db.query(
        `insert into dev_auth.factors (user_id, secret, verified_at) values ($1, $2, now())`,
        [userId, account.totpSecret],
      );
    }
  }

  await db.query(
    `insert into profiles (id, email, name) values ($1, $2, $3) on conflict (id) do nothing`,
    [userId, account.email, account.name],
  );
  return userId;
}

/**
 * The dev admin's identity, profile and platform_admin membership, with a
 * verified authenticator. Run on every dev database start, so an existing
 * database gains the account the first time it runs this code.
 */
export async function seedDevAdmin(db: Db): Promise<void> {
  const userId = await ensureDevAccount(db, DEV_ADMIN);
  await db.query(
    `insert into memberships (profile_id, role)
     select $1, 'platform_admin'
      where not exists (
        select 1 from memberships where profile_id = $1 and role = 'platform_admin')`,
    [userId],
  );
}

/** Dana, owner of the pilot franchisee company. Same rules as seedDevAdmin. */
export async function seedDevFranchisee(db: Db, franchiseeId: string): Promise<void> {
  const userId = await ensureDevAccount(db, DEV_FRANCHISEE);
  await db.query(
    `insert into memberships (profile_id, brand_id, role, franchisee_id)
     select $1, f.brand_id, 'franchisee_owner', f.id from franchisees f
      where f.id = $2
        and not exists (
          select 1 from memberships m
           where m.profile_id = $1 and m.brand_id = f.brand_id and m.role = 'franchisee_owner')`,
    [userId, franchiseeId],
  );
}

/** Freshbites' brand admin and reviewer. Same rules as seedDevAdmin. */
export async function seedDevCorporate(db: Db, brandSlug: string): Promise<void> {
  for (const [account, role] of [
    [DEV_BRAND_ADMIN, 'brand_admin'],
    [DEV_BRAND_REVIEWER, 'brand_reviewer'],
  ] as const) {
    const userId = await ensureDevAccount(db, account);
    await db.query(
      `insert into memberships (profile_id, brand_id, role)
       select $1, b.id, $3::member_role from brands b
        where b.slug = $2
          and not exists (
            select 1 from memberships m
             where m.profile_id = $1 and m.brand_id = b.id and m.role = $3::member_role)`,
      [userId, brandSlug, role],
    );
  }
}

/** Riley, staff at the pilot company, assigned one store. Same rules as seedDevAdmin. */
export async function seedDevStaff(db: Db, franchiseeId: string): Promise<void> {
  const userId = await ensureDevAccount(db, DEV_STAFF);
  const existing = await db.query<{ id: string }>(
    `select id from memberships where profile_id = $1 and role = 'franchisee_staff'`,
    [userId],
  );
  if (existing.rows.length > 0) return;
  const inserted = await db.query<{ id: string }>(
    `insert into memberships (profile_id, brand_id, role, franchisee_id)
     select $1, f.brand_id, 'franchisee_staff', f.id from franchisees f where f.id = $2
     returning id`,
    [userId, franchiseeId],
  );
  await db.query(
    `insert into membership_locations (membership_id, location_id)
     select $1, l.id from locations l where l.franchisee_id = $2 and l.name = $3`,
    [inserted.rows[0].id, franchiseeId, DEV_STAFF.store],
  );
}
