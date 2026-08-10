import { localStorageTokenKey } from "./localStorageTokenKey";
import { isDevToken } from "./devAuth";
import { clearAppStorage } from "./clearAppStorage";

export const UnauthorizedUser = (navigate) => {
  // Dev mock sessions (test1234 logins) carry a fake `dev-mock:` token the live
  // backend rejects with 401 — e.g. the studio's pricing/mockup calls. Don't log
  // those sessions out; they exist to preview the app without a real backend, so
  // the failed call just yields no data instead of kicking the user to /login.
  if (isDevToken(localStorage.getItem(localStorageTokenKey))) return;
  // Expired/invalid session → clear all user-scoped data, not just the token.
  clearAppStorage();
  navigate("/login");
};
