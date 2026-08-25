// Corporate's credential (SPEC §10, §9 interface 6).
//
// The reviewer's link and this one are both "a link in an email that is the
// whole authorization", and they are built differently on purpose. See the
// header of supabase/migrations/20260825090000_corporate_access.sql for the
// four axes; the one that shapes this file is that a dashboard link authorises
// READING, so it can afford to be long-lived and multi-use, and must not be
// able to approve anything.
//
// Who may hold one is not a question this file answers loosely: only an address
// already configured on the brand — its reviewer, its secondary reviewer, or its
// corporate contact — can be issued a link. There is no self-service enrolment,
// because the people entitled to see a franchisor's whole program are decided at
// white-glove setup, not by whoever types an address into a form.

import { createHash, randomBytes } from 'node:crypto';

import { query, queryOne } from '../db/pool';

/**
 * Long enough to be a working bookmark across a month of approvals, short
 * enough that a link forwarded out of the company stops working. Renewing is
 * one form field away, and every open extends nothing — the clock starts at
 * issue.
 */
export const CORPORATE_LINK_TTL_DAYS = 30;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function corporateUrl(brandSlug: string, token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return `${base}/${brandSlug}/corporate/${token}`;
}

export interface BrandRecipient {
  brandId: string;
  brandName: string;
  brandSlug: string;
  email: string;
  /** Which configured address matched — shown to the team, never to the requester. */
  role: 'reviewer' | 'reviewer_secondary' | 'corporate';
}

/**
 * Resolve an address against the brand's configured corporate contacts.
 *
 * Case-insensitive, because a person typing their own address into a form types
 * it however they please. Returns null for anything not on file — the caller is
 * responsible for saying the same thing either way (see `requestCorporateLink`).
 */
export async function findBrandRecipient(
  brandSlug: string,
  email: string,
): Promise<BrandRecipient | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  const brand = await queryOne<{
    id: string;
    name: string;
    slug: string;
    reviewer_email: string | null;
    reviewer_email_secondary: string | null;
    corporate_email: string | null;
  }>(
    `select id, name, slug, reviewer_email, reviewer_email_secondary, corporate_email
       from brands where slug = $1`,
    [brandSlug],
  );
  if (!brand) return null;

  const candidates: Array<[BrandRecipient['role'], string | null]> = [
    ['reviewer', brand.reviewer_email],
    ['reviewer_secondary', brand.reviewer_email_secondary],
    ['corporate', brand.corporate_email],
  ];
  const match = candidates.find(([, address]) => address?.trim().toLowerCase() === wanted);
  if (!match) return null;

  return {
    brandId: brand.id,
    brandName: brand.name,
    brandSlug: brand.slug,
    email: match[1]!.trim(),
    role: match[0],
  };
}

export interface MintedCorporateLink {
  token: string;
  url: string;
  email: string;
  expiresAt: string;
}

/**
 * Issue a link.
 *
 * Earlier links are deliberately NOT revoked. A reviewer's link is revoked on
 * re-mint because two live links could decide the same package twice; nothing
 * here decides anything, and the realistic reason for a second request is "I am
 * on my phone now" or "I lost the email" — both of which are worse served by
 * silently killing the link on the other device. Each expires on its own clock,
 * and `revokeCorporateLinks` exists for the case that actually warrants it:
 * someone leaving the franchisor.
 */
export async function mintCorporateLink(
  brandId: string,
  email: string,
): Promise<MintedCorporateLink> {
  const brand = await queryOne<{ slug: string }>(`select slug from brands where id = $1`, [brandId]);
  if (!brand) throw new Error('Unknown brand');

  const token = randomBytes(32).toString('base64url');
  const row = await queryOne<{ expires_at: string }>(
    `insert into corporate_links (brand_id, email, token_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' days')::interval)
     returning expires_at`,
    [brandId, email.trim().toLowerCase(), hash(token), CORPORATE_LINK_TTL_DAYS],
  );

  return {
    token,
    url: corporateUrl(brand.slug, token),
    email,
    expiresAt: row!.expires_at,
  };
}

export interface ResolvedCorporateLink {
  id: string;
  brandId: string;
  email: string;
  expiresAt: string;
}

export type CorporateLinkFailure =
  | { reason: 'unknown' }
  | { reason: 'expired'; expiredAt: string }
  | { reason: 'revoked' };

/**
 * Resolve a presented token, and stamp that it was used.
 *
 * Like the reviewer's resolver this returns WHY rather than a bare null: "that
 * link expired — ask for a new one" is a page someone can act on, and a 404 is
 * not. Expiry is the common case here by design, since the link is a bookmark
 * people keep.
 */
export async function resolveCorporateLink(
  token: string,
): Promise<
  { ok: true; link: ResolvedCorporateLink } | { ok: false; failure: CorporateLinkFailure }
> {
  const row = await queryOne<{
    id: string;
    brand_id: string;
    email: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `select id, brand_id, email, expires_at, revoked_at
       from corporate_links where token_hash = $1`,
    [hash(token)],
  );

  if (!row) return { ok: false, failure: { reason: 'unknown' } };
  if (row.revoked_at) return { ok: false, failure: { reason: 'revoked' } };
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, failure: { reason: 'expired', expiredAt: row.expires_at } };
  }

  await query(`update corporate_links set last_seen_at = now() where id = $1`, [row.id]);

  return {
    ok: true,
    link: { id: row.id, brandId: row.brand_id, email: row.email, expiresAt: row.expires_at },
  };
}

/** Every live link for a brand, or for one person at that brand. */
export async function revokeCorporateLinks(brandId: string, email?: string): Promise<number> {
  const revoked = await query<{ id: string }>(
    `update corporate_links set revoked_at = now()
      where brand_id = $1
        and revoked_at is null
        and ($2::text is null or email = lower($2))
      returning id`,
    [brandId, email ?? null],
  );
  return revoked.length;
}
