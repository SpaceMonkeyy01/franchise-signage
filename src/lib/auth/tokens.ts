// Opaque single-use tokens: invitations and password resets (SPEC v2.3 §10.3).
//
// The same shape as review and corporate links: 32 random bytes in the URL,
// SHA-256 in the database, so a dump of the tables is not a set of sign-ups or
// password changes.

import { createHash, randomBytes } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** Absolute URL for a path, on the configured origin. Every emailed link goes through here. */
export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return `${base}${path}`;
}
