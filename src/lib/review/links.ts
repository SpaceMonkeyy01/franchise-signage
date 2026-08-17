// The reviewer's credential (SPEC §10).
//
// A corporate reviewer never signs in. They act from a link in an email, so that
// link has to carry the whole authorization by itself, and the design follows
// from what can go wrong with one:
//
//   · stored hashed, so a database dump is not a set of working approvals;
//   · expiring, because an approval link found in an inbox two years later
//     should not still work (7 days, SPEC §9 interface 3);
//   · revoked when the package changes, so an email describing v1 can never
//     approve v2 — the franchisee edited it in between;
//   · retired when the review is finished, which is what "single-use" means
//     here (see docs/DECISIONS.md #27: one link per email, not per button).

import { createHash, randomBytes } from 'node:crypto';

import { query, queryOne } from '../db/pool';

/** SPEC §9 interface 3. Long enough for a reviewer's week, short enough to expire. */
export const REVIEW_LINK_TTL_DAYS = 7;

export interface MintedLink {
  token: string;
  url: string;
  reviewerEmail: string;
  expiresAt: string;
}

export interface ResolvedLink {
  id: string;
  requestId: string;
  reviewerEmail: string;
  packageVersion: number;
}

export type LinkFailure =
  | { reason: 'unknown' }
  | { reason: 'expired'; expiredAt: string }
  | { reason: 'revoked' }
  | { reason: 'used'; usedAt: string };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function reviewUrl(token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return `${base}/review/${token}`;
}

/**
 * Mint a link for the request's current package version.
 *
 * Revokes any earlier live link first: at most one email can act on a request at
 * a time, so a reviewer who was sent v1 and then v2 cannot approve from the
 * stale message sitting above it in their inbox.
 */
export async function mintReviewLink(
  requestId: string,
  reviewerEmail: string,
): Promise<MintedLink> {
  await revokeReviewLinks(requestId);

  const request = await queryOne<{ package_version: number }>(
    `select package_version from requests where id = $1`,
    [requestId],
  );
  if (!request) throw new Error('Unknown request');

  const token = randomBytes(32).toString('base64url');
  const row = await queryOne<{ expires_at: string }>(
    `insert into review_links
       (request_id, reviewer_email, token_hash, package_version, expires_at)
     values ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
     returning expires_at`,
    [requestId, reviewerEmail, hash(token), request.package_version, REVIEW_LINK_TTL_DAYS],
  );

  return { token, url: reviewUrl(token), reviewerEmail, expiresAt: row!.expires_at };
}

/**
 * Resolve a presented token.
 *
 * Returns WHY a link failed rather than a bare null: "that link expired" and
 * "that link was replaced when you asked for changes" are different things to
 * tell a reviewer, and both are better than a 404.
 */
export async function resolveReviewLink(
  token: string,
): Promise<{ ok: true; link: ResolvedLink } | { ok: false; failure: LinkFailure }> {
  const row = await queryOne<{
    id: string;
    request_id: string;
    reviewer_email: string;
    package_version: number;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
    current_version: number;
  }>(
    `select l.id, l.request_id, l.reviewer_email, l.package_version, l.expires_at,
            l.used_at, l.revoked_at, r.package_version as current_version
       from review_links l
       join requests r on r.id = l.request_id
      where l.token_hash = $1`,
    [hash(token)],
  );

  if (!row) return { ok: false, failure: { reason: 'unknown' } };
  if (row.revoked_at || row.package_version !== row.current_version) {
    return { ok: false, failure: { reason: 'revoked' } };
  }
  if (row.used_at) return { ok: false, failure: { reason: 'used', usedAt: row.used_at } };
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, failure: { reason: 'expired', expiredAt: row.expires_at } };
  }

  return {
    ok: true,
    link: {
      id: row.id,
      requestId: row.request_id,
      reviewerEmail: row.reviewer_email,
      packageVersion: row.package_version,
    },
  };
}

/** Invalidate every live link on a request — called before minting a new one. */
export async function revokeReviewLinks(requestId: string): Promise<void> {
  await query(
    `update review_links set revoked_at = now()
      where request_id = $1 and used_at is null and revoked_at is null`,
    [requestId],
  );
}

/**
 * Retire the link once nothing on the request is pending.
 *
 * The reviewer may click Approve on three items from one email, so the link
 * survives until the work it was sent for is done — then it stops working.
 */
export async function retireLinkIfReviewComplete(requestId: string): Promise<boolean> {
  const pending = await queryOne<{ count: string }>(
    `select count(*) as count from line_items
      where request_id = $1 and item_status = 'pending_review'`,
    [requestId],
  );
  if (Number(pending?.count ?? 0) > 0) return false;

  await query(
    `update review_links set used_at = now()
      where request_id = $1 and used_at is null and revoked_at is null`,
    [requestId],
  );
  return true;
}
