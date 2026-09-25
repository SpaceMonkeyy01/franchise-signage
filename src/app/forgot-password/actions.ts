'use server';

import { requestPasswordReset } from '@/lib/auth/password-reset';

/** Always resolves the same way: the caller must not learn whether an account exists. */
export async function askForReset(email: string): Promise<void> {
  if (!email.trim()) return;
  await requestPasswordReset(email);
}
