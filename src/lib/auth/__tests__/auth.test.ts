// The pure parts of sign-in (SPEC v2.3 §10.3.3), pinned.
//
// Each is a way of being wrong that looks fine from the outside:
//
// 1. A TOTP implementation that agrees with itself and with no authenticator
//    app. The dev provider and the smoke suite both compute codes, so a shared
//    mistake would pass every check — the RFC's own vectors cannot.
// 2. A password rule the UI enforces and the server does not.
// 3. An open redirect on the end of sign-in: `next` arrives in a URL.
// 4. The 12-hour Signage.com session limit running from the wrong clock.

import { describe, expect, it } from 'vitest';

import { platformSessionExpired, requiresSecondFactor, safeNext, type Membership, type Viewer } from '../access';
import { passwordProblem, PASSWORD_MIN_LENGTH } from '../password';
import { otpauthUri, totpCode, verifyTotp } from '../totp';

// RFC 6238 appendix B, SHA-1: the ASCII secret "12345678901234567890", base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 vector at T=%i', (seconds, code) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it('accepts one step of drift either way, and no more', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBe(false);
  });

  it('refuses anything that is not six digits', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
  });

  it('builds a URI authenticator apps read', () => {
    expect(otpauthUri('ABC', 'a@b.test')).toBe(
      'otpauth://totp/Franchise%20by%20Signage%3Aa%40b.test?secret=ABC&issuer=Franchise%20by%20Signage',
    );
  });
});

describe('passwordProblem', () => {
  it(`requires ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1), 'x@y.test')).toMatch(/at least/);
    expect(passwordProblem('a'.repeat(PASSWORD_MIN_LENGTH), 'x@y.test')).toBeNull();
  });

  it('refuses the email address as the password', () => {
    expect(passwordProblem('Someone@Example.com', 'someone@example.com')).toMatch(/email/);
  });
});

describe('safeNext', () => {
  it('keeps a same-origin path', () => {
    expect(safeNext('/admin/team', '/')).toBe('/admin/team');
  });

  it.each(['https://evil.test', '//evil.test', '/\\evil.test', 'admin'])(
    'refuses %s',
    (next) => {
      expect(safeNext(next, '/fallback')).toBe('/fallback');
    },
  );
});

const membership = (overrides: Partial<Membership>): Membership => ({
  id: 'm',
  role: 'franchisee_owner',
  brandId: 'b',
  brandSlug: 'freshbites',
  brandName: 'Freshbites',
  franchiseeId: 'f',
  brandRequiresTwoFactor: false,
  ...overrides,
});

describe('second factor', () => {
  it('is always required of Signage.com, and never forced on franchisees', () => {
    expect(requiresSecondFactor([membership({ role: 'platform_admin', brandId: null })])).toBe(true);
    expect(requiresSecondFactor([membership({ brandRequiresTwoFactor: true })])).toBe(false);
  });

  it("follows the brand's switch for its admins and reviewers (D8)", () => {
    expect(requiresSecondFactor([membership({ role: 'brand_reviewer' })])).toBe(false);
    expect(
      requiresSecondFactor([membership({ role: 'brand_reviewer', brandRequiresTwoFactor: true })]),
    ).toBe(true);
  });
});

describe('platformSessionExpired', () => {
  const viewerAt = (authenticatedAt: Date) =>
    ({ identity: { authenticatedAt } }) as unknown as Viewer;
  const now = new Date('2026-09-25T20:00:00Z');

  it('runs 12 hours from the password', () => {
    expect(platformSessionExpired(viewerAt(new Date('2026-09-25T08:30:00Z')), now)).toBe(false);
    expect(platformSessionExpired(viewerAt(new Date('2026-09-25T07:30:00Z')), now)).toBe(true);
  });
});
