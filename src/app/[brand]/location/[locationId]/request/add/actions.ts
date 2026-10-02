'use server';

// Adding signs to an existing location (docs/flow-demo.jsx step "addpick").
//
// Everything picked here is an add-on: it is not in the location's standard
// package, so SPEC §7 sends it to corporate. The screen says so before anything
// is picked, and this action does not decide it — deriveInitialItemStatus does,
// inside createAndSubmitRequest, from the brand's approval mode.

import { redirect } from 'next/navigation';

import { checkStoreOrdering } from '@/lib/auth/stores';
import { createAndSubmitRequest } from '@/lib/db/create-request';
import type { SignDesign } from '@/lib/designs/design';
import { attachQuoteSheets } from '@/lib/designs/sheets';
import { prepareDesignedItems } from '@/lib/designs/submit';
import { StudioError } from '@/lib/designs/studio';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import { plural } from '@/lib/format';

export interface AddSignsInput {
  brandSlug: string;
  locationId: string;
  items: Array<{ brandItemId: string; sizing: string | null; tbd: boolean; design?: SignDesign | null }>;
}

export async function submitAddSigns(input: AddSignsInput): Promise<SubmitFailure | undefined> {
  if (input.items.length === 0) return { error: 'Pick at least one sign.' };

  const access = await checkStoreOrdering(input.brandSlug, input.locationId);
  if ('error' in access) return { error: access.error };

  const location = await queryOne<{ brand_id: string }>(
    `select l.brand_id from locations l
       join brands b on b.id = l.brand_id
      where l.id = $1 and b.slug = $2`,
    [input.locationId, input.brandSlug],
  );
  if (!location) return { error: 'That location is not on this brand.' };

  // Studio designs are checked and priced here, before the request's
  // transaction: pricing is a ~15 s network call (src/lib/designs/submit.ts).
  let designed;
  try {
    designed = await prepareDesignedItems(
      location.brand_id,
      input.items.map((item) => ({ brandItemId: item.brandItemId, origin: 'addon' as const, design: item.design })),
    );
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    throw error;
  }

  let token: string;
  let requestId: string;
  try {
    const created = await createAndSubmitRequest({
      brandId: location.brand_id,
      locationId: input.locationId,
      intent: 'add',
      createdBy: access.viewer.profile.id,
      items: input.items.map((item, index) => ({
        brandItemId: item.brandItemId,
        origin: designed[index].origin,
        siteNotes: designed[index].siteNotes,
        design: designed[index].design,
        estPrice: designed[index].estPrice,
        priceSource: designed[index].priceSource,
        files: designed[index].mockup ? [{ kind: 'mockup' as const, ...designed[index].mockup }] : [],
        // A Studio design carries its own size; the franchisee's site note follows it.
        sizing: designed[index].design
          ? [`${designed[index].design.dimension.inches}" ${designed[index].design.dimension.axis}`, item.sizing?.trim()]
              .filter(Boolean)
              .join(' · ')
          : item.tbd
            ? null
            : item.sizing,
        // TBD is always allowed and never blocks submission (SPEC §5.4); it
        // flags the team to follow up, and the status page says so.
        tbdFields: item.tbd && !designed[index].design ? ['sizing'] : [],
      })),
      summary: ({ total, pendingReview }) =>
        pendingReview > 0
          ? `${plural(total, 'new sign')} requested for existing location — needs corporate approval`
          : `${plural(total, 'new sign')} requested for existing location`,
    });
    token = created.accessToken;
    requestId = created.id;
  } catch (error) {
    console.error('add-signs submission failed', error);
    return { error: 'That request could not be submitted. Nothing was saved — try again.' };
  }

  // Outside the try: the request is committed, and a mail failure must not tell
  // the franchisee their submission failed when it did not.
  // Each Studio-designed sign gets its quote sheet, kept with the request
  // (#168). Never fatal: the request is already committed.
  await attachQuoteSheets(requestId).catch((error) => console.error('quote sheets failed', error));
  await notifyFranchisee(requestId, 'submitted');

  redirect(`/${input.brandSlug}/request/${token}`);
}
