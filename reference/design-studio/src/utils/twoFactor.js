// Single source of truth for the login-time 2FA gate.
//
// ProtectedRoute redirects to /verification whenever the stored
// `localStorageIs2faVerified` value is not "true". The backend currently
// returns `is_2fa_verified: false` for every account on login/refresh and does
// NOT expose whether 2FA is actually enabled for the user — and 2FA enrollment
// (Settings > Security) is still a non-functional mock. Gating purely on
// `is_2fa_verified` therefore dead-ends every login on an OTP screen with no
// obtainable code.
//
// Rule: the session is cleared past 2FA UNLESS the backend explicitly says 2FA
// is enabled for this user (`is_2fa_enabled === true`) AND it has not yet been
// verified this session. As soon as the backend starts returning
// `is_2fa_enabled: true` for enrolled users, the /verification gate re-engages
// automatically — no further frontend change needed.
//
// Accepts either the auth payload ({ user, token, is_2fa_verified, ... }) or a
// bare user object, reading the flags from whichever level carries them.
export const is2faCleared = (data) => {
  const user = data?.user ?? data;
  const enabled =
    (data?.is_2fa_enabled ?? user?.is_2fa_enabled) === true;
  const verified =
    (data?.is_2fa_verified ?? user?.is_2fa_verified) === true;
  return !enabled || verified;
};

// Convenience: the exact string to store in localStorage (ProtectedRoute does a
// strict `!== "true"` comparison).
export const twoFaStorageValue = (data) => (is2faCleared(data) ? "true" : "false");
