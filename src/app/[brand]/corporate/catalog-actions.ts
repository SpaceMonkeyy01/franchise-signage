'use server';

// Corporate's side of the catalog (SPEC v2.4 §2.3): a brand admin proposes a
// sign, revises or withdraws a proposal, and retires or reinstates a live
// sign. No price is ever taken here — Signage.com sets every price. Reviewers
// see the tab and call none of these.
//
// The brand comes from the caller's access, never from the browser, and every
// action checks it — Server Actions are reachable by direct POST.

import { revalidatePath } from 'next/cache';

import { checkCorporate, type CorporateAccess } from '@/lib/auth/corporate';
import {
  CatalogError,
  addStoreType,
  moveStoreType,
  proposeSign,
  reviseSign,
  savePackage,
  setSignActive,
  setSignImage,
  setStoreTypeActive,
  updateStoreType,
  withdrawSign,
  type CatalogActor,
  type PackageFormat,
  type Proposal,
} from '@/lib/catalog/manage';
import { storeSignImage } from '@/lib/catalog/images';
import { notifySignProposed } from '@/lib/email/catalog';
import type { SubmitFailure } from '@/lib/forms';

async function run(
  brandSlug: string,
  fn: (access: CorporateAccess, actor: CatalogActor) => Promise<void>,
): Promise<SubmitFailure | undefined> {
  const access = await checkCorporate(brandSlug, { manage: true });
  if ('error' in access) return access;
  const actor: CatalogActor = {
    membershipId: access.membership.id,
    label: access.viewer.profile.name ?? access.viewer.profile.email,
  };
  try {
    await fn(access, actor);
  } catch (error) {
    if (error instanceof CatalogError) return { error: error.message };
    console.error('catalog action failed', error);
    return { error: 'That did not save. Try again.' };
  }
  revalidatePath(`/${brandSlug}/corporate`, 'page');
  return undefined;
}

export async function proposeSignAction(brandSlug: string, proposal: Proposal) {
  return run(brandSlug, async (access, actor) => {
    const id = await proposeSign(access.brand.id, actor, proposal);
    await notifySignProposed(id);
  });
}

export async function reviseSignAction(brandSlug: string, itemId: string, proposal: Proposal) {
  return run(brandSlug, async (access, actor) => {
    await reviseSign(access.brand.id, itemId, actor, proposal);
    await notifySignProposed(itemId);
  });
}

export async function withdrawSignAction(brandSlug: string, itemId: string) {
  return run(brandSlug, (access, actor) => withdrawSign(access.brand.id, itemId, actor));
}

export async function setBrandSignActiveAction(brandSlug: string, itemId: string, active: boolean) {
  return run(brandSlug, (access, actor) => setSignActive(access.brand.id, itemId, actor, active));
}

/** Live at once (§2.3): the next store set up with this format gets it. */
export async function savePackageAction(
  brandSlug: string,
  input: { format: PackageFormat; label: string; description: string | null; items: string[] },
) {
  return run(brandSlug, (access, actor) => savePackage(access.brand.id, actor, input));
}

// Store types (DECISIONS #156): the brand's own list, each with its package.

export async function addStoreTypeAction(brandSlug: string, input: { label: string; description: string | null }) {
  return run(brandSlug, async (access, actor) => {
    await addStoreType(access.brand.id, actor, input);
  });
}

export async function updateStoreTypeAction(
  brandSlug: string,
  key: string,
  input: { label: string; description: string | null },
) {
  return run(brandSlug, (access, actor) => updateStoreType(access.brand.id, key, actor, input));
}

export async function setStoreTypeActiveAction(brandSlug: string, key: string, active: boolean) {
  return run(brandSlug, (access, actor) => setStoreTypeActive(access.brand.id, key, actor, active));
}

export async function moveStoreTypeAction(brandSlug: string, key: string, direction: -1 | 1) {
  return run(brandSlug, (access) => moveStoreType(access.brand.id, key, direction));
}

/** A sign's own picture (#157); no file removes it. Prices stay the team's. */
export async function setBrandSignImageAction(brandSlug: string, itemId: string, formData: FormData | null) {
  return run(brandSlug, async (access, actor) => {
    const path = formData ? await storeSignImage(formData) : null;
    await setSignImage(access.brand.id, itemId, actor, path);
  });
}
