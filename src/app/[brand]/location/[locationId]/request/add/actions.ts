'use server';

// Adding signs to an existing location (docs/flow-demo.jsx step "addpick").
//
// Everything picked here is an add-on: it is not in the location's standard
// package, so SPEC §7 sends it to corporate. The screen says so before anything
// is picked, and this action does not decide it — deriveInitialItemStatus does,
// inside createAndSubmitRequest, from the brand's approval mode.

import { redirect } from 'next/navigation';

import { createAndSubmitRequest } from '@/lib/db/create-request';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';

export interface AddSignsInput {
  brandSlug: string;
  locationId: string;
  items: Array<{ brandItemId: string; sizing: string | null; tbd: boolean }>;
}

export async function submitAddSigns(input: AddSignsInput): Promise<SubmitFailure | undefined> {
  if (input.items.length === 0) return { error: 'Pick at least one sign.' };

  const location = await queryOne<{ brand_id: string }>(
    `select l.brand_id from locations l
       join brands b on b.id = l.brand_id
      where l.id = $1 and b.slug = $2`,
    [input.locationId, input.brandSlug],
  );
  if (!location) return { error: 'That location is not on this brand.' };

  let token: string;
  let requestId: string;
  try {
    const created = await createAndSubmitRequest({
      brandId: location.brand_id,
      locationId: input.locationId,
      intent: 'add',
      items: input.items.map((item) => ({
        brandItemId: item.brandItemId,
        origin: 'addon',
        sizing: item.tbd ? null : item.sizing,
        // TBD is always allowed and never blocks submission (SPEC §5.4); it
        // flags the team to follow up, and the status page says so.
        tbdFields: item.tbd ? ['sizing'] : [],
      })),
      summary: ({ total, pendingReview }) =>
        pendingReview > 0
          ? `${total} new sign(s) requested for existing location — needs corporate approval`
          : `${total} new sign(s) requested for existing location`,
    });
    token = created.accessToken;
    requestId = created.id;
  } catch (error) {
    console.error('add-signs submission failed', error);
    return { error: 'That request could not be submitted. Nothing was saved — try again.' };
  }

  // Outside the try: the request is committed, and a mail failure must not tell
  // the franchisee their submission failed when it did not.
  await notifyFranchisee(requestId, 'submitted');

  redirect(`/${input.brandSlug}/request/${token}`);
}
