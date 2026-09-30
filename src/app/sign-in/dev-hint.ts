// The seeded accounts, offered above the sign-in form in development only.
// Null under Supabase, where these accounts do not exist. Each sign-in lists
// the accounts that belong on it: Signage.com's own shows the team, a brand's
// shows that brand's franchisees and corporate. The form turns each into a
// button that fills in the email and password.

import {
  DEV_ADMIN,
  DEV_BRAND_ADMIN,
  DEV_BRAND_REVIEWER,
  DEV_FRANCHISEE,
  DEV_STAFF,
} from '@/lib/auth/dev-auth';
import { authProvider } from '@/lib/auth/identity';

export interface DevAccount {
  /** Who it is, as the button says it: "Franchisee (owner)". */
  role: string;
  name: string;
  email: string;
  password: string;
}

export function devSignInAccounts(audience: 'platform' | 'brand'): DevAccount[] | null {
  if (authProvider() !== 'dev') return null;
  const accounts =
    audience === 'platform'
      ? [{ role: 'Signage.com team', ...DEV_ADMIN }]
      : [
          { role: 'Franchisee (owner)', ...DEV_FRANCHISEE },
          { role: 'Store manager', ...DEV_STAFF },
          { role: 'Brand admin', ...DEV_BRAND_ADMIN },
          { role: 'Brand reviewer', ...DEV_BRAND_REVIEWER },
        ];
  // Only what the form needs: the admin's authenticator secret stays here.
  return accounts.map(({ role, name, email, password }) => ({ role, name, email, password }));
}
