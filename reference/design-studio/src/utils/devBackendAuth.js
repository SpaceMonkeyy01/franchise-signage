// DEV-ONLY. Seeded mock users (devAuth.js) have no real backend account, so their
// fake `dev-mock:` token 401s on live API calls (studio pricing/mockups). On mock
// login we authenticate once with a shared real "service" account and use ITS
// token as the session token, so backend calls succeed while the app still shows
// the mock user's identity/role.
//
// Credentials come from .env.development.local (VITE_DEV_BACKEND_*), which a
// production build never loads — so nothing here ends up in the prod bundle.
import API from "../json/apiConfig.js";

const EMAIL = import.meta.env.VITE_DEV_BACKEND_EMAIL;
const PASSWORD = import.meta.env.VITE_DEV_BACKEND_PASSWORD;

// Log in as the service account and return a real backend token, or null if the
// creds aren't configured / the login fails (caller falls back to the fake token).
export const fetchDevBackendToken = async () => {
  if (!EMAIL || !PASSWORD) return null;
  try {
    const res = await fetch(API.BACKEND_API_URL + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.token ?? null;
  } catch {
    return null;
  }
};
