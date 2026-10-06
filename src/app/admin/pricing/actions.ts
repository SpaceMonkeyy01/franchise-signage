'use server';

// The team sets Signage.com's margins (SPEC v2.6 §8, DECISIONS #165). Every
// action checks the caller itself — Server Actions are reachable by direct POST.

import { revalidatePath } from 'next/cache';

import { assertTeamMember } from '@/lib/auth/team';
import type { SubmitFailure } from '@/lib/forms';
import { parseMarginInput } from '@/lib/pricing/margin';
import { MarginError, setMargin, setQuoteConfirmation } from '@/lib/pricing/margins';
import { TokenError, saveEngineToken } from '@/lib/signize/token';

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

export async function setQuoteConfirmationAction(
  brandId: string,
  teamConfirms: boolean,
): Promise<SubmitFailure | undefined> {
  const member = await assertTeamMember();
  try {
    await setQuoteConfirmation(
      { membershipId: member.membershipId, label: member.name ?? member.email },
      brandId,
      teamConfirms,
    );
  } catch (error) {
    if (error instanceof MarginError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/pricing');
  return undefined;
}

/** Save the Design Studio engine's session token (DECISIONS #183). Never sent back. */
export async function saveEngineTokenAction(token: string): Promise<SubmitFailure | undefined> {
  const member = await assertTeamMember();
  try {
    await saveEngineToken(token, member.name ?? member.email);
  } catch (error) {
    if (error instanceof TokenError) return { error: error.message };
    throw error;
  }
  revalidatePath('/admin/pricing');
  return undefined;
}
