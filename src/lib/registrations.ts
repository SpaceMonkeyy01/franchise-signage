// Registering a franchisee (SPEC §8d level 1).
//
// The first half of the two-level access model, and the only franchisee identity
// that exists before a lease. Corporate does this at agreement signing: one
// email address appended to the countersigning bundle they already send. That
// single write is what fires the welcome email — there is no second "send"
// step, because a registration nobody was told about is not access.
//
// Their dashboard is Session 6, so today the team performs it on corporate's
// behalf, exactly as they export the §8b budget sheet (DECISIONS #44). Which is
// why `registeredBy` is a parameter rather than the column default: the record
// should say who actually typed it.

import { queryOne } from './db/pool';
import { sendWelcomeEmail } from './email/welcome';

export type RegistrationActor = 'corporate' | 'team';

export interface RegisterResult {
  registrationId: string;
  /** False when the address was already registered — see below. */
  created: boolean;
  emailSent: boolean;
}

/** Deliberately loose: this rejects typos, not unusual-but-valid addresses. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Register an email against a brand, and welcome them.
 *
 * A repeat registration is NOT an error. `(brand_id, email)` is unique, and the
 * realistic way this happens is corporate re-sending because the franchisee says
 * they never got it — so the row is kept, the token stays the one already in
 * their inbox, and the mail goes again. Minting a new token would invalidate the
 * link in the first email, which is the opposite of what was asked for.
 */
export async function registerFranchisee(options: {
  brandId: string;
  email: string;
  name?: string | null;
  registeredBy: RegistrationActor;
}): Promise<RegisterResult> {
  const email = options.email.trim().toLowerCase();
  if (!looksLikeEmail(email)) throw new Error(`"${options.email}" is not an email address.`);

  const name = options.name?.trim() || null;

  const inserted = await queryOne<{ id: string }>(
    `insert into franchisee_registrations (brand_id, email, name, registered_by)
     values ($1, $2, $3, $4)
     on conflict (brand_id, email) do nothing
     returning id`,
    [options.brandId, email, name, options.registeredBy],
  );

  const existing =
    inserted ??
    (await queryOne<{ id: string }>(
      `update franchisee_registrations set name = coalesce($3, name)
        where brand_id = $1 and email = $2
        returning id`,
      [options.brandId, email, name],
    ));
  if (!existing) throw new Error('That registration could not be saved.');

  const outcome = await sendWelcomeEmail(existing.id);
  return { registrationId: existing.id, created: !!inserted, emailSent: outcome.sent };
}
