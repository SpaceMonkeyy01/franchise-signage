'use server';

// Asking for a dashboard link (SPEC §9 interface 6).
//
// The one public, unauthenticated write in the corporate surface, so it is
// written to be boring: it takes a brand slug and an address, and whatever
// happens it returns the same thing. Deciding who is entitled to a link is
// `findBrandRecipient`'s job and it reads the brand's configured contacts —
// there is no enrolment here, only recognition.

import { sendCorporateLink } from '@/lib/email/corporate';

export interface LinkRequestResult {
  /**
   * Always true for a syntactically valid address, whether or not anything was
   * sent. Whether a given person is a franchisor's signage reviewer is theirs
   * to disclose, and a form that answered honestly would enumerate them.
   */
  acknowledged: boolean;
  error?: string;
}

export async function requestCorporateLinkAction(
  brandSlug: string,
  email: string,
): Promise<LinkRequestResult> {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    // The one thing worth failing on: a typo is the requester's own problem to
    // fix, and "check your inbox" for an address that cannot receive mail wastes
    // the twenty minutes they spend waiting for it.
    return { acknowledged: false, error: 'That does not look like an email address.' };
  }

  try {
    await sendCorporateLink(brandSlug, address);
  } catch (error) {
    // A provider failure must not become a hint that the address was on file.
    console.error('corporate link request failed', error);
  }

  return { acknowledged: true };
}
