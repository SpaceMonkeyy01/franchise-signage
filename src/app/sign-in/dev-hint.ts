// The seeded accounts, printed above the sign-in form in development only.
// Null under Supabase, where these accounts do not exist. Each sign-in lists
// the accounts that belong on it: Signage.com's own shows the team, a brand's
// shows that brand's franchisees and corporate.

import {
  DEV_ADMIN,
  DEV_BRAND_ADMIN,
  DEV_BRAND_REVIEWER,
  DEV_FRANCHISEE,
  DEV_STAFF,
} from '@/lib/auth/dev-auth';
import { authProvider } from '@/lib/auth/identity';

export function devSignInHint(audience: 'platform' | 'brand'): string | null {
  if (authProvider() !== 'dev') return null;
  if (audience === 'platform') {
    return `Seeded account: Signage.com team ${DEV_ADMIN.email} / ${DEV_ADMIN.password}.`;
  }
  return `Seeded accounts: franchisee ${DEV_FRANCHISEE.email} / ${DEV_FRANCHISEE.password}; store manager ${DEV_STAFF.email} / ${DEV_STAFF.password}; brand admin ${DEV_BRAND_ADMIN.email} / ${DEV_BRAND_ADMIN.password}; reviewer ${DEV_BRAND_REVIEWER.email} / ${DEV_BRAND_REVIEWER.password}.`;
}
