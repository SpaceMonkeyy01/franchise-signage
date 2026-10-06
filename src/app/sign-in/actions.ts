'use server';

// Signing in and out (SPEC v2.3 §10.3.3).
//
// Signing in establishes WHO someone is and nothing else. Where they may go is
// decided afterwards, on every request, by their memberships (src/lib/auth/
// access.ts) — so a correct password on an account with no role reaches nothing.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { homeFor, membershipsFor, requiresSecondFactor, safeNext } from '@/lib/auth/access';
import { endSession, signInWithPassword } from '@/lib/auth/identity';
import { isConsoleHost, portalConfig, portalOrigin } from '@/lib/portal';
import { portalSlug } from '@/lib/portal-request';
import {
  LOCKOUT_MINUTES,
  clearFailedSignIns,
  lockState,
  recordFailedSignIn,
} from '@/lib/auth/password';
import { getBrandBySlug } from '@/lib/db/queries';
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

  // The console's own address (decision #146) is the team's. A brand account
  // signed in here would be sent on to its brand's address, where this session
  // does not exist — so say where to sign in instead of signing in twice.
  const host = (await headers()).get('host');
  const config = portalConfig();
  if (isConsoleHost(host, config) && !memberships.some((m) => m.role === 'platform_admin')) {
    const addresses = [...new Set(memberships.map((m) => m.brandSlug).filter((s) => s !== null))]
      .map((slug) => portalOrigin(slug, host, config)?.replace(/^https?:\/\//, ''))
      .filter(Boolean);
    await endSession();
    return {
      error: addresses.length
        ? `This sign-in is for the Signage.com team. Sign in at ${addresses.join(' or ')} instead.`
        : 'This sign-in is for the Signage.com team.',
    };
  }
  const destination = safeNext(next, homeFor(memberships, await portalSlug()));
  if (requiresSecondFactor(memberships)) {
    redirect(`/two-factor?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

/**
 * Sign out, and land where this person came in (DECISIONS #194).
 *
 * From a brand's pages: that brand's front page, which is where its people sign
 * in again. Anywhere else (the console, two-factor): the Signage.com sign-in,
 * saying they are signed out. The brand comes from the portal header on a
 * brand's own address, otherwise from the page the button was on. The target
 * is always the explicit `/{slug}` path: a redirect from an action is not
 * re-routed by the proxy, so `/` would open the Signage.com front page.
 */
export async function signOut(): Promise<void> {
  const slug = (await portalSlug()) ?? brandInReferer((await headers()).get('referer'));
  const brand = slug ? await getBrandBySlug(slug) : null;
  await endSession();
  redirect(brand ? `/${brand.slug}` : '/sign-in?reason=signed_out');
}

/** The first path segment of the page a form was posted from, if it could be a brand slug. */
function brandInReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const segment = new URL(referer).pathname.split('/')[1] ?? '';
    return /^[a-z0-9-]+$/.test(segment) && segment !== 'admin' ? segment : null;
  } catch {
    return null;
  }
}
