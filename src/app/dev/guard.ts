// The one thing standing between this console and the world.
//
// /dev has NO authentication of any kind and performs every privileged action in
// the system — package prep, corporate approvals, vendor routing, marking a sign
// installed. That is acceptable for a local demo and unacceptable anywhere else,
// so it refuses to exist outside development unless someone deliberately turns
// it on with DEV_CONSOLE=1.
//
// Sessions 3 and 4 replace it: /admin behind Supabase Auth and the team_members
// allowlist, and signed single-use email links for the reviewer.

import { notFound } from 'next/navigation';

export function devConsoleEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEV_CONSOLE === '1';
}

/** Call at the top of every /dev page and every /dev server action. */
export function assertDevConsole(): void {
  if (!devConsoleEnabled()) notFound();
}
