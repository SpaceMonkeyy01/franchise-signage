'use server';

// The team's side of the catalog (SPEC v2.4 §2.3): review a brand's proposal,
// set prices, retire or reinstate, and keep the master catalog. Every action
// checks the caller itself — Server Actions are reachable by direct POST.

import { revalidatePath } from 'next/cache';

import { assertTeamMember } from '@/lib/auth/team';
import {
  CatalogError,
  addMasterVariant,
  approveSign,
  declineSign,
  getSign,
  setMasterActive,
  setSignActive,
  setSignPrice,
  type CatalogActor,
  type NewVariant,
} from '@/lib/catalog/manage';
import type { SubmitFailure } from '@/lib/forms';

async function run(fn: (actor: CatalogActor) => Promise<unknown>): Promise<SubmitFailure | undefined> {
  const member = await assertTeamMember();
  try {
    await fn({ membershipId: member.membershipId, label: member.name ?? member.email });
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/catalog');
  return undefined;
}

/** A price field: empty means "Custom quote". */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new CatalogError('Enter the price as a number, or leave it empty for a custom quote.');
  return value;
}

export async function approveSignAction(
  itemId: string,
  decision: { name: string; specSummary: string; price: string; note: string },
) {
  return run((actor) =>
    approveSign(itemId, actor, {
      name: decision.name,
      specSummary: decision.specSummary,
      price: parsePrice(decision.price),
      note: decision.note,
    }),
  );
}

export async function declineSignAction(itemId: string, note: string) {
  return run((actor) => declineSign(itemId, actor, note));
}

export async function setSignPriceAction(itemId: string, price: string) {
  return run((actor) => setSignPrice(itemId, actor, parsePrice(price)));
}

export async function setSignActiveAction(itemId: string, active: boolean) {
  return run(async (actor) => {
    // The brand is read from the sign, not taken from the browser.
    const sign = await getSign(itemId);
    if (!sign) throw new CatalogError('That sign no longer exists.');
    await setSignActive(sign.brand_id, itemId, actor, active);
  });
}

export async function setMasterActiveAction(masterId: string, active: boolean) {
  return run((actor) => setMasterActive(masterId, actor, active));
}

export async function addMasterVariantAction(input: NewVariant) {
  return run((actor) => addMasterVariant(actor, input));
}
