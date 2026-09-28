// Brand portals (SPEC v2.3 §10.4): `{brand}.signage.com` serves `/{brand}/…`.
//
// All the deciding is in src/lib/portal.ts, where it is unit-tested; this only
// applies it. A request on any other host — localhost, the console's address,
// a Render hostname — passes through untouched, so nothing about the
// path-based URLs changes.

import { NextResponse, type NextRequest } from 'next/server';

import { brandFromHost, PORTAL_HEADER, portalConfig, routePortal } from './lib/portal';

const portals = portalConfig();

export function proxy(request: NextRequest) {
  const slug = brandFromHost(request.headers.get('host'), portals);
  if (!slug) {
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
