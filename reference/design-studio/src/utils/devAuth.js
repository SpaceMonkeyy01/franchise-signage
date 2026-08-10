// Dev-only mock login. Lets the seeded admin-portal users (adminMockUsers.js)
// sign in WITHOUT the backend so every role can be tested directly — no console
// role-override trick needed. The mock role lands you on the right home with the
// correct nav and access gates.
//
// SAFETY: every consumer guards these with `import.meta.env.DEV`, so none of
// this runs in a production build. Real logins always go through the backend.

import { mockUsers } from "./adminMockUsers";

// Shared password for ALL mock accounts. Dev convenience only.
export const DEV_LOGIN_PASSWORD = "test1234";

const DEV_TOKEN_PREFIX = "dev-mock:";
const DEV_USER_KEY = "dev-mock-user";

// The accounts that can log in via the mock path (one per role + a suspended one
// to exercise the blocked-login path). Sourced from the same seed the admin
// portal shows, so the portal and logins stay consistent.
export const devLoginAccounts = mockUsers;

// Match an email + the shared dev password against the seeded users.
export const findDevLogin = (email, password) => {
  if (password !== DEV_LOGIN_PASSWORD) return null;
  const e = (email || "").trim().toLowerCase();
  return mockUsers.find((u) => u.email.toLowerCase() === e) || null;
};

export const devToken = (user) => `${DEV_TOKEN_PREFIX}${user.id}`;
export const isDevToken = (token) =>
  typeof token === "string" && token.startsWith(DEV_TOKEN_PREFIX);

// Persist the mock user so GetLoggedInUser can restore the session on refresh
// without a backend call.
export const storeDevUser = (user) => {
  try {
    localStorage.setItem(DEV_USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore quota/serialization issues in dev */
  }
};

export const readDevUser = () => {
  try {
    return JSON.parse(localStorage.getItem(DEV_USER_KEY));
  } catch {
    return null;
  }
};

export const clearDevUser = () => localStorage.removeItem(DEV_USER_KEY);
