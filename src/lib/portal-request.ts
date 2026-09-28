// Which brand portal, if any, this request arrived on (SPEC v2.3 §10.4).
//
// Kept apart from ./portal.ts, which the proxy imports and must stay free of
// `next/headers`. The header is set by src/proxy.ts on a portal host and
// stripped on every other, so a client cannot claim to be on one.

import { headers } from 'next/headers';

import { PORTAL_HEADER } from './portal';

export async function portalSlug(): Promise<string | null> {
  return (await headers()).get(PORTAL_HEADER);
}
