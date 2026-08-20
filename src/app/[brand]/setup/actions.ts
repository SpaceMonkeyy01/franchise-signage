'use server';

// Initial setup: a new location and its first request (docs/flow-demo.jsx
// steps setup1–setup4).
//
// This is the only franchisee flow that creates a location, and the only one
// that asks the §8b financing question — both belong to the moment a site first
// exists. Everything after this request is a lookup against the record it
// starts.

import { redirect } from 'next/navigation';

import { createLocationWithRequest, toRequestFile } from '@/lib/db/create-request';
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

  const brand = await queryOne<{ id: string }>(`select id from brands where slug = $1`, [
    input.brandSlug,
  ]);
  if (!brand) return { error: 'Unknown brand.' };

  let token: string;
  let requestId: string;
  try {
    const { request } = await createLocationWithRequest({
      brandId: brand.id,
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
        items: input.items.map((item) => ({
          brandItemId: item.brandItemId,
          origin: originOf(item),
          sizing: item.tbd ? null : item.sizing,
          tbdFields: item.tbd ? ['sizing'] : [],
          exceptionIssue: item.exceptionIssue,
          files: item.photo ? [toRequestFile('placement_photo', item.photo)] : [],
        })),
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

  await notifyFranchisee(requestId, 'submitted');

  redirect(`/${input.brandSlug}/request/${token}`);
}

/**
 * A standard sign the franchisee says will not work at the site is an
 * `exception`, not a standard item — which is precisely what corporate exists to
 * judge (SPEC §7). Derived here rather than sent by the browser so the origin
 * and the issue text cannot disagree.
 */
function originOf(item: SetupItemInput): LineItemOrigin {
  if (!item.fromPackage) return 'addon';
  return item.exceptionIssue?.trim() ? 'exception' : 'standard';
}
