// The seeded accounts, printed above the sign-in form in development only —
// shared by /sign-in and the landing page at /. Null under Supabase, where
// these accounts do not exist.

import {
  DEV_ADMIN,
  DEV_BRAND_ADMIN,
  DEV_BRAND_REVIEWER,
  DEV_FRANCHISEE,
  DEV_STAFF,
} from '@/lib/auth/dev-auth';
import { authProvider } from '@/lib/auth/identity';

export function devSignInHint(): string | null {
  if (authProvider() !== 'dev') return null;
  return `Seeded accounts: Signage.com ${DEV_ADMIN.email} / ${DEV_ADMIN.password}; franchisee ${DEV_FRANCHISEE.email} / ${DEV_FRANCHISEE.password}; store manager ${DEV_STAFF.email} / ${DEV_STAFF.password}; brand admin ${DEV_BRAND_ADMIN.email} / ${DEV_BRAND_ADMIN.password}; reviewer ${DEV_BRAND_REVIEWER.email} / ${DEV_BRAND_REVIEWER.password}.`;
}
