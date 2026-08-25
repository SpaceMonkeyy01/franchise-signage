// Resolving corporate's credential on the server (SPEC §10).
//
// Every corporate surface — the dashboard, its actions, and the §8b document
// route it links to — starts here, so there is exactly one place that decides
// what a presented token opens. The rule is narrow and worth stating plainly:
// the token names a brand, and the URL names a brand, and unless they are the
// same brand nothing is returned. A link is not a key to the building.

import { getBrandBySlug, type BrandPublic } from '../db/queries';
import { resolveCorporateLink, type CorporateLinkFailure } from './links';

export interface CorporateSession {
  brand: BrandPublic;
  /** Which of the brand's configured contacts is holding this link. */
  email: string;
  expiresAt: string;
  token: string;
}

export type CorporateSessionResult =
  | { ok: true; session: CorporateSession }
  | { ok: false; failure: CorporateLinkFailure };

/**
 * Resolve `/{brand_slug}/corporate/{token}`.
 *
 * A token for brand A presented under brand B's slug fails as `unknown` rather
 * than redirecting to the right page: the two are different brands' programs,
 * and quietly showing someone the one they did not ask for is worse than a
 * dead end.
 */
export async function corporateSession(
  brandSlug: string,
  token: string,
): Promise<CorporateSessionResult> {
  const resolved = await resolveCorporateLink(token);
  if (!resolved.ok) return resolved;

  const brand = await getBrandBySlug(brandSlug);
  if (!brand || brand.id !== resolved.link.brandId) {
    return { ok: false, failure: { reason: 'unknown' } };
  }

  return {
    ok: true,
    session: {
      brand,
      email: resolved.link.email,
      expiresAt: resolved.link.expiresAt,
      token,
    },
  };
}

/** The action-side guard. Throws rather than returning, so a caller cannot forget to check. */
export async function assertCorporateSession(
  brandSlug: string,
  token: string,
): Promise<CorporateSession> {
  const result = await corporateSession(brandSlug, token);
  if (!result.ok) throw new Error('That dashboard link is no longer valid.');
  return result.session;
}
