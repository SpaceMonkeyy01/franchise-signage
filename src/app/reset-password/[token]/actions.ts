'use server';

import { redirect } from 'next/navigation';

import { setPassword } from '@/lib/auth/identity';
import { clearFailedSignIns, passwordProblem } from '@/lib/auth/password';
import { markResetUsed, resolvePasswordReset } from '@/lib/auth/password-reset';
import type { SubmitFailure } from '@/lib/forms';

/**
 * Set the new password and send the person to sign in with it.
 *
 * Not signed in automatically: the link proves control of the inbox, and signing
 * in afterwards proves they know the password they just chose — and walks them
 * through two-factor, which a reset must never skip.
 */
export async function completeReset(
  token: string,
  password: string,
  confirm: string,
): Promise<SubmitFailure | undefined> {
  const reset = await resolvePasswordReset(token);
  if (!reset) return { error: 'This link has expired. Ask for a new one.' };

  const problem = passwordProblem(password, reset.email);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  await setPassword(reset.profileId, password);
  await markResetUsed(reset.resetId);
  // A reset is the way out of a lockout, too.
  await clearFailedSignIns(reset.profileId);

  redirect('/sign-in?reason=reset');
}
