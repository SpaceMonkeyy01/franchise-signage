'use server';

// A franchisee previews their adjusted design (SPEC v2.6 §8 point 3): our price
// and a mockup, from the server. Nothing is saved here — the design rides on
// the request, and submission checks and prices it again.

import { getBrandBySlug } from '@/lib/db/queries';
import { checkStoreCreation, checkStoreOrdering } from '@/lib/auth/stores';
import { breaches, type SignDesign } from '@/lib/designs/design';
import { flaggedDesignLine } from '@/lib/designs/resubmit';
import { StudioError, getDesignableSign, quoteDesign } from '@/lib/designs/studio';

export async function previewFranchiseeDesignAction(
  brandSlug: string,
  locationId: string | null,
  brandItemId: string,
  design: SignDesign,
): Promise<{ design: SignDesign; outside: string[] } | { error: string }> {
  // Ordering for a store they have, or setting up a new one (no store yet).
  const access = locationId ? await checkStoreOrdering(brandSlug, locationId) : await checkStoreCreation(brandSlug);
  if ('error' in access) return { error: access.error };
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) return { error: 'Unknown brand.' };
  const sign = await getDesignableSign(brandItemId, brand.id);
  if (!sign?.design) return { error: 'This sign has no Studio design to adjust.' };
  try {
    const priced = await quoteDesign(sign, design);
    return { design: priced, outside: breaches(sign.design, sign.design_rules, design) };
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    console.error('franchisee preview failed', error);
    return { error: 'The preview did not work. Try again.' };
  }
}

/**
 * The same preview while answering a change request: the request's link and a
 * sign corporate sent back authorize it, as they authorize the resubmission.
 */
export async function previewResubmitDesignAction(
  token: string,
  lineItemId: string,
  design: SignDesign,
): Promise<{ design: SignDesign; outside: string[] } | { error: string }> {
  const line = await flaggedDesignLine(token, lineItemId);
  if (!line) return { error: 'This sign is not waiting on changes.' };
  const sign = await getDesignableSign(line.brandItemId, line.brandId);
  if (!sign?.design) return { error: 'This sign has no Studio design to adjust.' };
  try {
    const priced = await quoteDesign(sign, design);
    return { design: priced, outside: breaches(sign.design, sign.design_rules, design) };
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    console.error('resubmission preview failed', error);
    return { error: 'The preview did not work. Try again.' };
  }
}
