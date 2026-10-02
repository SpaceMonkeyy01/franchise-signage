'use server';

// Initial setup: a new location and its first request (docs/flow-demo.jsx
// steps setup1–setup4).
//
// This is the only franchisee flow that creates a location, and the only one
// that asks the §8b financing question — both belong to the moment a site first
// exists. Everything after this request is a lookup against the record it
// starts.

import { redirect } from 'next/navigation';

import { checkStoreCreation } from '@/lib/auth/stores';
import { createLocationWithRequest, toRequestFile } from '@/lib/db/create-request';
import type { SignDesign } from '@/lib/designs/design';
import { attachQuoteSheets } from '@/lib/designs/sheets';
import { prepareDesignedItems } from '@/lib/designs/submit';
import { StudioError } from '@/lib/designs/studio';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import type { LineItemOrigin, LocationFormat } from '@/lib/status/types';
import type { StoredObject } from '@/lib/storage';

export interface SetupItemInput {
  brandItemId: string;
  /** Where it came from: the loaded package, or the add-on catalog. */
  fromPackage: boolean;
  sizing: string | null;
  tbd: boolean;
  /** Set when the franchisee flagged a standard sign as unworkable at the site. */
  exceptionIssue: string | null;
  photo: StoredObject | null;
  /** Adjusted in the Design Studio; checked and priced again here (SPEC v2.6 §8). */
  design?: SignDesign | null;
}

export interface SetupInput {
  brandSlug: string;
  location: {
    name: string;
    line1: string;
    city: string;
    state: string;
    zip: string;
    format: LocationFormat;
    openingDate: string;
  };
  requester: { name: string; email: string; phone: string };
  /** §8b. Null when the franchisee skipped the question, which is allowed. */
  financingInvolved: boolean | null;
  landlordContact: { name: string; email: string; phone: string } | null;
  /** The lease sign exhibit. Null is fine — TBD never blocks a submission. */
  leaseExhibit: StoredObject | null;
  items: SetupItemInput[];
}

export async function submitInitialSetup(input: SetupInput): Promise<SubmitFailure | undefined> {
  if (!input.location.name.trim()) return { error: 'Give the location a name.' };
  if (!input.location.format) return { error: 'Pick a location format.' };
  if (input.items.length === 0) return { error: 'The package is empty — pick a format first.' };

  // Reachable by direct POST, so it decides for itself (SPEC v2.3 §10.2).
  const access = await checkStoreCreation(input.brandSlug);
  if ('error' in access) return { error: access.error };
  // An owner's new store belongs to their company. Signage.com starting one on
  // someone's behalf leaves it unowned until a franchisee is attached to it.
  const franchiseeId = access.scope.kind === 'franchisee' ? access.scope.franchiseeId : null;

  const brand = await queryOne<{ id: string }>(`select id from brands where slug = $1`, [
    input.brandSlug,
  ]);
  if (!brand) return { error: 'Unknown brand.' };

  // What the package for this format holds, counted: an item is `standard`
  // only while the package still has one of it (SPEC v2.4 §7 note).
  const pkg = await queryOne<{ items: string[] }>(
    `select items from brand_packages where brand_id = $1 and format = $2`,
    [brand.id, input.location.format],
  );
  const inPackage = new Map<string, number>();
  for (const id of pkg?.items ?? []) inPackage.set(id, (inPackage.get(id) ?? 0) + 1);

  // Studio designs are checked and priced before the transaction: pricing is
  // a ~15 s network call (src/lib/designs/submit.ts). Outside the brand's
  // limits, a standard sign becomes an exception.
  let designed;
  try {
    designed = await prepareDesignedItems(
      brand.id,
      input.items.map((item) => ({
        brandItemId: item.brandItemId,
        origin: originOf(item, inPackage),
        design: item.design,
        exceptionIssue: item.exceptionIssue,
      })),
    );
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    throw error;
  }

  let token: string;
  let requestId: string;
  try {
    const { request } = await createLocationWithRequest({
      brandId: brand.id,
      franchiseeId,
      location: {
        name: input.location.name.trim(),
        address: {
          line1: input.location.line1.trim(),
          city: input.location.city.trim(),
          state: input.location.state.trim(),
          zip: input.location.zip.trim(),
        },
        format: input.location.format,
        openingDate: input.location.openingDate,
      },
      request: {
        intent: 'initial_setup',
        createdBy: access.viewer.profile.id,
        requester: {
          name: input.requester.name,
          email: input.requester.email,
          phone: input.requester.phone,
        },
        financingInvolved: input.financingInvolved,
        landlordContact: input.landlordContact ?? null,
        files: input.leaseExhibit
          ? [toRequestFile('landlord_criteria', input.leaseExhibit)]
          : [],
        notes: input.leaseExhibit
          ? []
          : [
              'Lease sign exhibit not provided at submission — the Signage.com team will ' +
                'follow up before the package is prepared.',
            ],
        items: input.items.map((item, index) => {
          const studio = designed[index];
          return {
            brandItemId: item.brandItemId,
            origin: studio.origin,
            // A Studio design carries its own size; the sizing field is for the rest.
            sizing: studio.design
              ? `${studio.design.dimension.inches}" ${studio.design.dimension.axis}`
              : item.tbd
                ? null
                : item.sizing,
            tbdFields: item.tbd && !studio.design ? ['sizing'] : [],
            exceptionIssue: studio.exceptionIssue,
            design: studio.design,
            estPrice: studio.estPrice,
            priceSource: studio.priceSource,
            files: [
              ...(item.photo ? [toRequestFile('placement_photo', item.photo)] : []),
              ...(studio.mockup ? [{ kind: 'mockup' as const, ...studio.mockup }] : []),
            ],
          };
        }),
        summary: ({ total, pendingReview }) =>
          `Initial setup submitted (${total - pendingReview} standard + ${pendingReview} needing review)`,
      },
    });
    token = request.accessToken;
    requestId = request.id;
  } catch (error) {
    console.error('initial setup submission failed', error);
    return { error: 'That submission failed. Nothing was saved — try again.' };
  }

  // Each Studio-designed sign gets its quote sheet, kept with the request
  // (#168). Never fatal: the request is already committed.
  await attachQuoteSheets(requestId).catch((error) => console.error('quote sheets failed', error));
  await notifyFranchisee(requestId, 'submitted');

  redirect(`/${input.brandSlug}/request/${token}`);
}

/**
 * A standard sign the franchisee says will not work at the site is an
 * `exception`, not a standard item — which is precisely what corporate exists to
 * judge (SPEC §7). Derived here rather than sent by the browser so the origin
 * and the issue text cannot disagree.
 *
 * And `standard` is decided against the brand's package, never taken from the
 * browser's `fromPackage` alone (SPEC v2.4 §2.3): standard auto-approves, so a
 * forged flag would otherwise skip corporate. Each package entry covers one
 * item, so an endcap's two storefront sets are both standard and a third is an
 * add-on.
 */
function originOf(item: SetupItemInput, inPackage: Map<string, number>): LineItemOrigin {
  const left = inPackage.get(item.brandItemId) ?? 0;
  if (!item.fromPackage || left === 0) return 'addon';
  inPackage.set(item.brandItemId, left - 1);
  return item.exceptionIssue?.trim() ? 'exception' : 'standard';
}
