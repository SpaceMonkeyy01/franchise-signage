// Brand portals: `{brand}.signage.com` (SPEC v2.3 §10.4, phase D).
//
// One address per brand, serving the pages that already exist: the request's
// host names a brand, and `freshbites.signage.com/corporate` serves what
// `/freshbites/corporate` serves. Nothing is rebuilt, the path-based URLs keep
// working everywhere, and local development needs no DNS — browsers resolve
// `*.localhost` to this machine, so `freshbites.localhost:3000` is a portal.
//
// Pure on purpose: src/proxy.ts calls it on every request, and a function of
// (host, path) is one a unit test can pin exhaustively. No database — the
// proxy must not do slow work — so an unknown subdomain simply rewrites to a
// brand slug that does not exist, and that brand's pages answer 404 as they
// would at `/nosuch`.
//
// Each brand gets its own sign-in session for free: cookies are host-only by
// default, so being signed in at freshbites.signage.com carries nothing to
// another brand's address (§10.4).

/** Header the proxy sets so a page can tell it is being served on a portal. */
export const PORTAL_HEADER = 'x-brand-portal';

/**
 * Paths that are the same on every address: sign-in and everything around it,
 * the reviewer's link, file and document routes, and Next's own. They are not
 * brand pages, and prefixing them would break every link that points at them.
 */
const SHARED_PREFIXES = [
  '/_next',
  '/api',
  '/sign-in',
  '/two-factor',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/review',
  '/favicon.ico',
];

/**
 * Subdomains of the portal domain that are never brands. `franchise` is the
 * console's suggested address (§10.4); the naming is a deployment decision
 * (§10.7 D6), so more can be added with PLATFORM_SUBDOMAINS.
 */
const RESERVED = ['www', 'franchise', 'app', 'admin', 'api'];

export interface PortalConfig {
  /** e.g. `signage.com`. Hosts under it are brand portals. */
  domains: string[];
  reserved: string[];
}

export function portalConfig(env: Record<string, string | undefined> = process.env): PortalConfig {
  const configured = (env.BRAND_PORTAL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  // `localhost` always counts outside production, so a portal can be opened on
  // any dev machine with no configuration.
  const domains =
    env.NODE_ENV === 'production' ? configured : [...new Set([...configured, 'localhost'])];
  const extra = (env.PLATFORM_SUBDOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { domains, reserved: [...RESERVED, ...extra] };
}

/** The brand slug a host names, or null when it is not a brand portal. */
export function brandFromHost(host: string | null, config: PortalConfig): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  for (const domain of config.domains) {
    if (!hostname.endsWith(`.${domain}`)) continue;
    const sub = hostname.slice(0, -(domain.length + 1));
    // One label only: `a.b.signage.com` is not a brand.
    if (!sub || sub.includes('.')) return null;
    if (config.reserved.includes(sub)) return null;
    return /^[a-z0-9-]+$/.test(sub) ? sub : null;
  }
  return null;
}

export type PortalRoute =
  | { kind: 'pass' }
  | { kind: 'rewrite'; path: string }
  /** The console lives on its own address (§10.4), not under a brand's. */
  | { kind: 'not_found' };

/**
 * What to do with a request to a brand portal.
 *
 *   /                    → /{slug}
 *   /corporate?tab=…     → /{slug}/corporate?tab=…   (search kept by the caller)
 *   /{slug}/corporate    → unchanged: links the app builds are path-based
 *   /sign-in, /review/…  → unchanged: shared routes
 *   /admin               → 404: the console is not served on a brand's address
 *   /otherbrand/…        → /{slug}/otherbrand/… → 404: one brand per address
 */
export function routePortal(slug: string, pathname: string): PortalRoute {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return { kind: 'not_found' };
  if (pathname === '/') return { kind: 'rewrite', path: `/${slug}` };
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return { kind: 'pass' };
  if (SHARED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { kind: 'pass' };
  }
  return { kind: 'rewrite', path: `/${slug}${pathname}` };
}
