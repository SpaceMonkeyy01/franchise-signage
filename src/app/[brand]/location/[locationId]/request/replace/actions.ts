'use server';

// Submitting a like-for-like replacement (SPEC §7, the fast lane).
//
// What makes this fast is what the franchisee does NOT supply: the brand item,
// the pinned spec and the sizing all come from the installed record, so the form
// only asks which sign and what happened to it. Everything the action needs
// beyond that is read from the database, not from the browser — a Server Action
// is reachable by direct POST, so the ids arriving here are treated as claims.

import { redirect } from 'next/navigation';

import { createAndSubmitRequest, toRequestFile } from '@/lib/db/create-request';
import { notifyFranchisee } from '@/lib/email/franchisee';
import { queryOne } from '@/lib/db/pool';
import type { SubmitFailure } from '@/lib/forms';
import type { ReplaceReason } from '@/lib/status/types';
import type { StoredObject } from '@/lib/storage';

const REASON_LABEL: Record<ReplaceReason, string> = {
  damaged: 'Damaged',
  worn: 'Faded / worn',
  vandalized: 'Vandalized',
};

export interface ReplacementInput {
  brandSlug: string;
  locationId: string;
  installedSignId: string;
  reason: ReplaceReason;
  /** Optional condition photo, already in storage. */
  photo: StoredObject | null;
}

export async function submitReplacement(
  input: ReplacementInput,
): Promise<SubmitFailure | undefined> {
  if (!REASON_LABEL[input.reason]) return { error: 'Pick what happened to the sign.' };

  // One query does the authorization: the sign has to be active, on this
  // location, under the brand in the URL. Anything else is not a replacement
  // this caller can make.
  const sign = await queryOne<{
    brand_id: string;
    brand_item_id: string;
    brand_item_name: string;
    sizing: string | null;
  }>(
    `select l.brand_id, s.brand_item_id, bi.name as brand_item_name, s.sizing
       from installed_signs s
       join locations l on l.id = s.location_id
       join brands b on b.id = l.brand_id
       join brand_items bi on bi.id = s.brand_item_id
      where s.id = $1 and s.location_id = $2 and b.slug = $3 and s.status = 'active'`,
    [input.installedSignId, input.locationId, input.brandSlug],
  );
  if (!sign) return { error: 'That sign is not on this location’s record.' };

  let token: string;
  let requestId: string;
  try {
    const created = await createAndSubmitRequest({
      brandId: sign.brand_id,
      locationId: input.locationId,
      intent: 'replace_like',
      items: [
        {
          brandItemId: sign.brand_item_id,
          origin: 'replacement',
          replacesSignId: input.installedSignId,
          replaceReason: input.reason,
          // Copied from the installed record, not asked for: this is the sizing
          // the original approval fixed, and the quote package, the status page
          // and the vendor email all need to state it.
          sizing: sign.sizing,
          files: input.photo ? [toRequestFile('condition_photo', input.photo)] : [],
        },
      ],
      summary: () =>
        `Like-for-like replacement: ${sign.brand_item_name} (${REASON_LABEL[input.reason]}) — ` +
        `pinned spec + sizing pulled from installed record`,
    });
    token = created.accessToken;
    requestId = created.id;
  } catch (error) {
    console.error('replacement submission failed', error);
    return { error: 'That request could not be submitted. Nothing was saved — try again.' };
  }

  await notifyFranchisee(requestId, 'submitted');

  redirect(`/${input.brandSlug}/request/${token}`);
}
