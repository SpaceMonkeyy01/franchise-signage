import { describe, expect, it } from 'vitest';

import { brandFromHost, portalConfig, portalOrigin, routePortal } from '../portal';

describe('portalOrigin', () => {
  const prod = portalConfig({ NODE_ENV: 'production', BRAND_PORTAL_DOMAINS: 'signage.com' });
  const dev = portalConfig({ NODE_ENV: 'development' });

  it('points development at *.localhost, keeping the port', () => {
    expect(portalOrigin('freshbites', 'localhost:3000', dev)).toBe('http://freshbites.localhost:3000');
  });

  it('points a deployment at the brand under the same domain', () => {
    expect(portalOrigin('freshbites', 'franchise.signage.com', prod)).toBe('https://freshbites.signage.com');
    expect(portalOrigin('freshbites', 'signage.com', prod)).toBe('https://freshbites.signage.com');
  });

  it('gives up on a host outside every portal domain, so the caller uses paths', () => {
    expect(portalOrigin('freshbites', 'portal.onrender.com', prod)).toBeNull();
    expect(portalOrigin('freshbites', 'localhost:3000', prod)).toBeNull();
    expect(portalOrigin('freshbites', null, prod)).toBeNull();
  });
});

describe('brandFromHost (SPEC v2.3 §10.4)', () => {
  const prod = portalConfig({ NODE_ENV: 'production', BRAND_PORTAL_DOMAINS: 'signage.com' });
  const dev = portalConfig({ NODE_ENV: 'development' });

  it('reads the brand from its own address', () => {
    expect(brandFromHost('freshbites.signage.com', prod)).toBe('freshbites');
    expect(brandFromHost('Freshbites.Signage.com:443', prod)).toBe('freshbites');
  });

  it('serves *.localhost in development with no configuration', () => {
    expect(brandFromHost('freshbites.localhost:3000', dev)).toBe('freshbites');
    expect(brandFromHost('localhost:3000', dev)).toBeNull();
  });

  it('never treats localhost as a portal domain in production unless told to', () => {
    expect(brandFromHost('freshbites.localhost:3000', prod)).toBeNull();
  });

  it('ignores the bare domain, other hosts, and nested or reserved subdomains', () => {
    expect(brandFromHost('signage.com', prod)).toBeNull();
    expect(brandFromHost('portal.onrender.com', prod)).toBeNull();
    expect(brandFromHost('a.b.signage.com', prod)).toBeNull();
    expect(brandFromHost('franchise.signage.com', prod)).toBeNull();
    expect(brandFromHost('www.signage.com', prod)).toBeNull();
    expect(brandFromHost(null, prod)).toBeNull();
  });

  it('lets a deployment reserve more subdomains (§10.7 D6)', () => {
    const custom = portalConfig({
      NODE_ENV: 'production',
      BRAND_PORTAL_DOMAINS: 'signage.com',
      PLATFORM_SUBDOMAINS: 'console',
    });
    expect(brandFromHost('console.signage.com', custom)).toBeNull();
  });
});

describe('routePortal', () => {
  it('serves the brand home at the root', () => {
    expect(routePortal('freshbites', '/')).toEqual({ kind: 'rewrite', path: '/freshbites' });
  });

  it("prefixes the brand's own pages", () => {
    expect(routePortal('freshbites', '/corporate')).toEqual({
      kind: 'rewrite',
      path: '/freshbites/corporate',
    });
    expect(routePortal('freshbites', '/request/abc')).toEqual({
      kind: 'rewrite',
      path: '/freshbites/request/abc',
    });
  });

  it('leaves path-based links alone, so every link the app builds keeps working', () => {
    expect(routePortal('freshbites', '/freshbites')).toEqual({ kind: 'pass' });
    expect(routePortal('freshbites', '/freshbites/corporate')).toEqual({ kind: 'pass' });
  });

  it('leaves the shared routes alone', () => {
    for (const path of ['/sign-in', '/two-factor', '/invite/t', '/review/t', '/api/files/x', '/_next/data']) {
      expect(routePortal('freshbites', path)).toEqual({ kind: 'pass' });
    }
  });

  it('keeps one brand per address', () => {
    expect(routePortal('freshbites', '/otherbrand/corporate')).toEqual({
      kind: 'rewrite',
      path: '/freshbites/otherbrand/corporate',
    });
    // A prefix of the slug is not the slug.
    expect(routePortal('freshbites', '/freshbitesx')).toEqual({
      kind: 'rewrite',
      path: '/freshbites/freshbitesx',
    });
  });

  it('does not serve the console on a brand address', () => {
    expect(routePortal('freshbites', '/admin')).toEqual({ kind: 'not_found' });
    expect(routePortal('freshbites', '/admin/team')).toEqual({ kind: 'not_found' });
  });
});
