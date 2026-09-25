// Password rules (SPEC v2.3 §10.3.3), and the lockout that goes with them.
//
// The rules are checked here, before the provider sees the password, so both
// providers enforce the same thing and the message is ours. Supabase's own
// minimum should be set to match; its leaked-password check (a paid-plan
// setting) runs on top, and is the one rule this file cannot apply.
//
// Lockout is counted on `profiles` rather than left to the provider: Supabase
// rate-limits by IP, which does nothing for one account being guessed at from
// many addresses, and an admin should be able to see and clear it.

import { query, queryOne } from '../db/pool';

export const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

export const MAX_FAILED_SIGN_INS = 5;
export const LOCKOUT_MINUTES = 15;

/** Null when acceptable, otherwise the sentence to show. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Your password cannot be your email address.';
  }
  return null;
}

export interface LockState {
  profileId: string;
  lockedUntil: Date | null;
}

/** The profile behind an address, and whether it is locked right now. */
export async function lockState(email: string): Promise<LockState | null> {
  const row = await queryOne<{ id: string; locked_until: string | null }>(
    `select id, case when locked_until > now() then locked_until end as locked_until
       from profiles where lower(email) = lower($1)`,
    [email.trim()],
  );
  if (!row) return null;
  return { profileId: row.id, lockedUntil: row.locked_until ? new Date(row.locked_until) : null };
}

/** Count a failure; the fifth in a row locks the account for LOCKOUT_MINUTES. */
export async function recordFailedSignIn(profileId: string): Promise<void> {
  await query(
    `update profiles
        set failed_sign_ins = case when failed_sign_ins + 1 >= $2 then 0 else failed_sign_ins + 1 end,
            locked_until = case when failed_sign_ins + 1 >= $2
                                then now() + ($3 || ' minutes')::interval
                                else locked_until end
      where id = $1`,
    [profileId, MAX_FAILED_SIGN_INS, LOCKOUT_MINUTES],
  );
}

export async function clearFailedSignIns(profileId: string): Promise<void> {
  await query(`update profiles set failed_sign_ins = 0, locked_until = null where id = $1`, [
    profileId,
  ]);
}
