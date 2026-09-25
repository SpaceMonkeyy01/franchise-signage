'use server';

// The demo's corporate tab needs a dashboard link, and a link is only ever
// issued to an address already configured on the brand. This picks that address
// rather than asking for one — the brand's corporate contact, else its reviewer —
// so the rule is the same one /admin/entry-points enforces, minus the typing.
//
// It returns a PATH, not `corporateUrl()`'s absolute URL: the tab loads it in a
// frame on this same origin, and APP_URL may name a different one.

import { assertTeamMember } from '@/lib/auth/team';
import { mintCorporateLink } from '@/lib/corporate/links';
import { queryOne } from '@/lib/db/pool';

export async function demoCorporateLinkAction(
  brandSlug: string,
): Promise<{ path: string; email: string } | { error: string }> {
  await assertTeamMember();

  const brand = await queryOne<{
    id: string;
    slug: string;
    contact: string | null;
  }>(
    `select id, slug, coalesce(corporate_email, reviewer_email, reviewer_email_secondary) as contact
       from brands where slug = $1`,
    [brandSlug],
  );
  if (!brand) return { error: 'Unknown brand.' };
  if (!brand.contact) {
    return {
      error: 'This brand has no corporate contact configured, so no dashboard link can be issued.',
    };
  }

  const minted = await mintCorporateLink(brand.id, brand.contact);
  return {
    path: `/${brand.slug}/corporate/${minted.token}`,
    email: minted.email,
  };
}
