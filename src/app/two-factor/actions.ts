'use server';

// The second factor (SPEC v2.3 §10.3.3, §10.7 D8): enrol an authenticator app
// once, then enter its code after each password sign-in. Required for
// Signage.com; available to anyone.

import { redirect } from 'next/navigation';

import { getViewer, homeFor, safeNext } from '@/lib/auth/access';
import {
  devCurrentCode,
  enrollTotp,
  getIdentity,
  totpFactors,
  verifyTotp,
  type TotpEnrollment,
} from '@/lib/auth/identity';
import type { SubmitFailure } from '@/lib/forms';

export async function startEnrollment(): Promise<
  (TotpEnrollment & { devCode: string | null }) | SubmitFailure
> {
  const viewer = await getViewer();
  if (!viewer) return { error: 'Your session has ended. Sign in again.' };
  // An account that already has a working authenticator replaces it only
  // through a Signage.com admin (lost phone), never from a half-signed-in
  // session — otherwise a stolen password could swap the second factor out.
  if ((await totpFactors()).some((factor) => factor.verified)) {
    return { error: 'This account already has an authenticator. Enter its code instead.' };
  }
  const enrollment = await enrollTotp(viewer.profile.email);
  return { ...enrollment, devCode: await devCurrentCode(enrollment.factorId) };
}

export async function confirmTwoFactor(
  factorId: string,
  code: string,
  next: string | null,
): Promise<SubmitFailure | undefined> {
  if (!(await getIdentity())) return { error: 'Your session has ended. Sign in again.' };

  if (!(await verifyTotp(factorId, code))) {
    return {
      error: "That code didn't match. Codes change every 30 seconds — enter the one showing now.",
    };
  }

  const viewer = await getViewer();
  redirect(safeNext(next, viewer ? homeFor(viewer.memberships) : '/'));
}
