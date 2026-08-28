'use server';

// Issuing a corporate dashboard link from the operator console.
//
// The public route at /{brand}/corporate mints one and MAILS it, and says the
// same sentence whichever address is given so it cannot be used to enumerate a
// franchisor's staff. Neither of those properties is wanted here: the operator
// already knows who is on the brand, and the point is to open the dashboard now
// rather than to wait for a message.
//
// What does NOT relax is who may hold one. The address must still be a contact
// already configured on the brand — reviewer, secondary reviewer, or corporate —
// because the link reaches that brand's whole programme and the configuration is
// the only statement anyone has made about who should see it. An operator
// wanting a link for a new address should add the address to the brand.

import { assertTeamMember } from '@/lib/auth/team';
import { findBrandRecipient, mintCorporateLink } from '@/lib/corporate/links';

export interface IssuedLink {
  url: string;
  email: string;
  role: string;
  expiresAt: string;
}

export async function issueCorporateLinkAction(
  brandSlug: string,
  email: string,
): Promise<{ link: IssuedLink } | { error: string }> {
  await assertTeamMember();

  const recipient = await findBrandRecipient(brandSlug, email);
  if (!recipient) {
    // Named plainly, unlike the public route: this reader is allowed to know.
    return {
      error: `${email.trim()} is not a configured contact on this brand. Add it to the brand first.`,
    };
  }

  const minted = await mintCorporateLink(recipient.brandId, recipient.email);
  return {
    link: {
      url: minted.url,
      email: minted.email,
      role: recipient.role,
      expiresAt: minted.expiresAt,
    },
  };
}
