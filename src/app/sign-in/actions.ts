'use server';

// Signing in and out (SPEC v2.3 §10.3.3).
//
// Signing in establishes WHO someone is and nothing else. Where they may go is
// decided afterwards, on every request, by their memberships (src/lib/auth/
// access.ts) — so a correct password on an account with no role reaches nothing.

import { redirect } from 'next/navigation';

import { homeFor, membershipsFor, requiresSecondFactor, safeNext } from '@/lib/auth/access';
import { endSession, signInWithPassword } from '@/lib/auth/identity';
import { portalSlug } from '@/lib/portal-request';
import {
  LOCKOUT_MINUTES,
  clearFailedSignIns,
  lockState,
  recordFailedSignIn,
} from '@/lib/auth/password';
import type { SubmitFailure } from '@/lib/forms';

export async function signIn(
  email: string,
  password: string,
  next: string | null,
): Promise<SubmitFailure | undefined> {
  if (!email.trim() || !password) return { error: 'Enter your email and password.' };

  const lock = await lockState(email);
  if (lock?.lockedUntil) {
    return {
      error: `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes, or reset your password.`,
    };
  }

  const userId = await signInWithPassword(email, password);
  if (!userId) {
    if (lock) await recordFailedSignIn(lock.profileId);
    // One sentence for a wrong password and an unknown address alike, so the
    // form cannot be used to learn who has an account.
    return { error: "That email and password don't match." };
  }

  // An identity with no profile can only be an acceptance that failed half-way.
  // It holds nothing, and a session for it would be a session to nowhere.
  if (!lock || lock.profileId !== userId) {
    await endSession();
    return { error: 'This account has not been set up. Open your invitation email to finish.' };
  }
  await clearFailedSignIns(userId);

  // Read by id rather than from the session just created: the cookie was set in
  // this request, and the session is the next request's to read.
  const memberships = await membershipsFor(userId);
  const destination = safeNext(next, homeFor(memberships, await portalSlug()));
  if (requiresSecondFactor(memberships)) {
    redirect(`/two-factor?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect('/sign-in');
}
