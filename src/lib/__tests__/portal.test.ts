import { describe, expect, it } from 'vitest';

import {
  brandFromHost,
  isConsoleHost,
  portalConfig,
  portalOrigin,
  routeConsole,
  routePortal,
  sendToConsole,
  splitBrandOrigin,
} from '../portal';

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

describe('the console on its own address (decision #146)', () => {
  const split = portalConfig({
    NODE_ENV: 'production',
    BRAND_PORTAL_DOMAINS: 'signage.com',
    APP_URL: 'https://admin.signage.com',
  });

  it('is APP_URL, when APP_URL is under a configured portal domain', () => {
    expect(split.consoleHost).toBe('admin.signage.com');
    expect(isConsoleHost('admin.signage.com', split)).toBe(true);
    expect(isConsoleHost('Admin.Signage.com:443', split)).toBe(true);
    expect(isConsoleHost('freshbites.signage.com', split)).toBe(false);
    expect(isConsoleHost(null, split)).toBe(false);
  });

  it('is off without configured domains, on a hosting address, and in plain development', () => {
    expect(portalConfig({ NODE_ENV: 'production', APP_URL: 'https://admin.signage.com' }).consoleHost).toBeNull();
    expect(
      portalConfig({
        NODE_ENV: 'production',
        BRAND_PORTAL_DOMAINS: 'signage.com',
        APP_URL: 'https://portal.onrender.com',
      }).consoleHost,
    ).toBeNull();
    // localhost is a portal domain in development only implicitly; that alone
    // must not move the path-based pages off localhost:3000.
    const dev = portalConfig({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000' });
    expect(dev.consoleHost).toBeNull();
    expect(isConsoleHost('localhost:3000', dev)).toBe(false);
  });

  it('can be tried in development by configuring localhost', () => {
    const dev = portalConfig({
      NODE_ENV: 'development',
      BRAND_PORTAL_DOMAINS: 'localhost',
      APP_URL: 'http://admin.localhost:3000',
    });
    expect(dev.consoleHost).toBe('admin.localhost:3000');
    expect(splitBrandOrigin('freshbites', dev)).toBe('http://freshbites.localhost:3000');
  });

  it('is never a brand, whatever its subdomain is called', () => {
    const custom = portalConfig({
      NODE_ENV: 'production',
      BRAND_PORTAL_DOMAINS: 'signage.com',
      APP_URL: 'https://console.signage.com',
    });
    expect(brandFromHost('console.signage.com', custom)).toBeNull();
    expect(brandFromHost('freshbites.signage.com', custom)).toBe('freshbites');
  });

  it("gives emailed links the brand's address only when split", () => {
    expect(splitBrandOrigin('freshbites', split)).toBe('https://freshbites.signage.com');
    const unsplit = portalConfig({ NODE_ENV: 'production', BRAND_PORTAL_DOMAINS: 'signage.com' });
    expect(splitBrandOrigin('freshbites', unsplit)).toBeNull();
  });
});

describe('routeConsole', () => {
  it('keeps the console, the front page and the shared routes', () => {
    for (const path of ['/', '/admin', '/admin/team', '/sign-in', '/two-factor', '/invite/t', '/review/t', '/api/files/x']) {
      expect(routeConsole(path)).toEqual({ kind: 'pass' });
    }
  });

  it("sends a brand's pages to the brand's address, without the slug", () => {
    expect(routeConsole('/freshbites')).toEqual({ kind: 'brand', slug: 'freshbites', path: '/' });
    expect(routeConsole('/freshbites/')).toEqual({ kind: 'brand', slug: 'freshbites', path: '/' });
    expect(routeConsole('/freshbites/request/abc')).toEqual({
      kind: 'brand',
      slug: 'freshbites',
      path: '/request/abc',
    });
  });

  it('does not mistake a prefix of the console for it', () => {
    expect(routeConsole('/adminx')).toEqual({ kind: 'brand', slug: 'adminx', path: '/' });
  });
});

describe('sendToConsole (decision #147)', () => {
  const split = portalConfig({
    NODE_ENV: 'production',
    BRAND_PORTAL_DOMAINS: 'signage.com',
    APP_URL: 'https://admin.signage.com',
  });

  it("sends the hosting address and the bare domain to the console's", () => {
    expect(split.consoleOrigin).toBe('https://admin.signage.com');
    expect(sendToConsole('portal.onrender.com', '/', split)).toBe(true);
    expect(sendToConsole('portal.onrender.com', '/freshbites/request/abc', split)).toBe(true);
    expect(sendToConsole('signage.com', '/sign-in', split)).toBe(true);
  });

  it('leaves the console, the API, and every deployment that is not split', () => {
    expect(sendToConsole('admin.signage.com', '/admin', split)).toBe(false);
    expect(sendToConsole('portal.onrender.com', '/api/cron/review-sla', split)).toBe(false);
    const unsplit = portalConfig({ NODE_ENV: 'production', APP_URL: 'https://portal.onrender.com' });
    expect(sendToConsole('portal.onrender.com', '/admin', unsplit)).toBe(false);
  });
});
