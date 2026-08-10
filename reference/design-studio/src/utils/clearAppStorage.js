// Wipe all user-scoped app data from localStorage on logout, so a shared or
// public machine never retains the previous user's session token, 2FA flag,
// customer PII, or stub data.
//
// Intentionally LEAVES per-company config that the Studio reads live and that
// isn't user PII: `margin-config-*` (the price math reads it) and
// `studio-logo-*` (branding). UI prefs like the mockup toggle are also left.
import {
  localStorageTokenKey,
  localStorageIs2faVerified,
} from "./localStorageTokenKey";

const KEYS = [
  localStorageTokenKey, // auth bearer token
  localStorageIs2faVerified, // 2FA-passed flag
  "placed-orders", // stub orders (customer PII + cost/margin)
  "placed-quotations", // stub estimates (customer PII + cost/margin)
  "pending-signups", // registrant PII
  "local-companies", // tenant list
  "dev-mock-user", // dev-only mock session
  "dev-role-override", // dev-only role preview
  "notifications-last-seen", // unread anchor
];

export const clearAppStorage = () => {
  for (const key of KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore quota/availability issues */
    }
  }
};