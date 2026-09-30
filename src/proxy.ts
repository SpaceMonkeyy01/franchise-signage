// Brand portals (SPEC v2.3 §10.4): `{brand}.signage.com` serves `/{brand}/…`,
// and, when the console has its own address (decision #146), a brand's page
// opened there is sent on to the brand's address.
//
// All the deciding is in src/lib/portal.ts, where it is unit-tested; this only
// applies it. A request on any other host — localhost, the console's address,
// a Render hostname — passes through untouched, so nothing about the
// path-based URLs changes.

import { NextResponse, type NextRequest } from 'next/server';

import {
  brandFromHost,
  isConsoleHost,
  PORTAL_HEADER,
  portalConfig,
  portalOrigin,
  routeConsole,
  routePortal,
} from './lib/portal';

const portals = portalConfig();

export function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  const slug = brandFromHost(host, portals);
  if (!slug) {
    if (isConsoleHost(host, portals)) {
      const route = routeConsole(request.nextUrl.pathname);
      const origin = route.kind === 'brand' ? portalOrigin(route.slug, host, portals) : null;
      if (route.kind === 'brand' && origin) {
        // Temporary, not permanent: a browser caches a 308 for good, and which
        // address is the console's is a setting that can change.
        return NextResponse.redirect(`${origin}${route.path}${request.nextUrl.search}`, 307);
      }
    }
    // Only the proxy says a request is on a portal; a client cannot.
    if (!request.headers.has(PORTAL_HEADER)) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.delete(PORTAL_HEADER);
    return NextResponse.next({ request: { headers } });
  }

  const route = routePortal(slug, request.nextUrl.pathname);
  if (route.kind === 'not_found') return new NextResponse('Not found', { status: 404 });

  // Tell the page it is on a portal, so the shared sign-in can wear the brand.
  const headers = new Headers(request.headers);
  headers.set(PORTAL_HEADER, slug);

  if (route.kind === 'pass') return NextResponse.next({ request: { headers } });

  const url = request.nextUrl.clone();
  url.pathname = route.path;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything but Next's static assets and files with an extension.
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
