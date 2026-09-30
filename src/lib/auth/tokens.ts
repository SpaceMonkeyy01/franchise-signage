// Opaque single-use tokens: invitations and password resets (SPEC v2.3 §10.3).
//
// The same shape as review and corporate links: 32 random bytes in the URL,
// SHA-256 in the database, so a dump of the tables is not a set of sign-ups or
// password changes.

import { createHash, randomBytes } from 'node:crypto';

import { portalConfig, splitBrandOrigin } from '../portal';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

const appBase = () => process.env.APP_URL ?? 'http://localhost:3000';

/** Absolute URL for a path, on the configured origin. Every emailed link goes through here. */
export function appUrl(path: string): string {
  return `${appBase()}${path}`;
}

/**
 * The origin a brand's people are sent to: the brand's own address when the
 * console has its own (decision #146), else APP_URL. For the shared routes —
 * `/invite/…`, `/review/…`, `/sign-in` — so the session they start is the
 * brand address's, where the brand's pages are.
 */
export function brandOrigin(slug: string): string {
  return splitBrandOrigin(slug, portalConfig()) ?? appBase();
}

/**
 * Absolute URL for one of a brand's pages, `path` relative to the brand:
 * `/request/abc` is `https://freshbites.signage.com/request/abc` on a split
 * deployment and `${APP_URL}/freshbites/request/abc` otherwise.
 */
export function brandUrl(slug: string, path: string): string {
  const origin = splitBrandOrigin(slug, portalConfig());
  return origin ? `${origin}${path || '/'}` : `${appBase()}/${slug}${path}`;
}
