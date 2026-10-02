'use server';

// The team sets Signage.com's margins (SPEC v2.6 §8, DECISIONS #165). Every
// action checks the caller itself — Server Actions are reachable by direct POST.

import { revalidatePath } from 'next/cache';

import { assertTeamMember } from '@/lib/auth/team';
import type { SubmitFailure } from '@/lib/forms';
import { parseMarginInput } from '@/lib/pricing/margin';
import { MarginError, setMargin } from '@/lib/pricing/margins';

export async function setMarginAction(
  brandId: string | null,
  signType: string | null,
  raw: string,
): Promise<SubmitFailure | undefined> {
  const member = await assertTeamMember();
  try {
    await setMargin(
      { membershipId: member.membershipId, label: member.name ?? member.email },
      { brandId, signType },
      parseMarginInput(raw),
    );
  } catch (error) {
    if (error instanceof MarginError || error instanceof RangeError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/pricing');
  return undefined;
}
