import { afterEach, describe, expect, it, vi } from 'vitest';

import { appUrl, brandOrigin, brandUrl } from '../tokens';

describe("emailed links to a brand's pages (decision #146)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stay path-based on APP_URL when the console has no address of its own', () => {
    vi.stubEnv('APP_URL', 'https://portal.onrender.com');
    vi.stubEnv('BRAND_PORTAL_DOMAINS', '');
    expect(brandUrl('freshbites', '/request/abc')).toBe('https://portal.onrender.com/freshbites/request/abc');
    expect(brandOrigin('freshbites')).toBe('https://portal.onrender.com');
  });

  it("go to the brand's own address when it does", () => {
    vi.stubEnv('APP_URL', 'https://admin.signage.com');
    vi.stubEnv('BRAND_PORTAL_DOMAINS', 'signage.com');
    expect(brandUrl('freshbites', '/request/abc')).toBe('https://freshbites.signage.com/request/abc');
    expect(brandUrl('freshbites', '')).toBe('https://freshbites.signage.com/');
    expect(brandOrigin('freshbites')).toBe('https://freshbites.signage.com');
    // The team's own links stay on the console.
    expect(appUrl('/invite/t')).toBe('https://admin.signage.com/invite/t');
  });
});
