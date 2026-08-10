import { useSelector } from "react-redux";
import { ROLES, ROLE_BY_EMAIL } from "../config/roles";

const VALID_ROLES = Object.values(ROLES);

// Key used by the dev-only role switcher (Sidebar) to preview the app as any
// role without a real admin account on the backend.
export const DEV_ROLE_OVERRIDE_KEY = "dev-role-override";

// Derive the current user's role. Reads `role` off the user object (falling
// back to user_type / type), and fails safe to the most restrictive role
// (`user`) when unknown — so an unrecognised role can never escalate access.
//
// In dev builds only, a localStorage override lets you preview the portal as
// any role (see Sidebar's dev switcher).
export const useRole = () => {
  const user = useSelector((state) => state.User?.user);

  if (import.meta.env.DEV) {
    const override = localStorage.getItem(DEV_ROLE_OVERRIDE_KEY);
    if (override && VALID_ROLES.includes(override)) return override;
  }

  // Email-based grant (elevates specific real accounts the backend can't).
  const email = user?.email?.toLowerCase();
  if (email && ROLE_BY_EMAIL[email]) return ROLE_BY_EMAIL[email];

  const raw = user?.role ?? user?.user_type ?? user?.type;
  return VALID_ROLES.includes(raw) ? raw : ROLES.USER;
};

// The current user's tenant id, used to scope a company_admin to their own
// company. The backend does not return this yet — assumed field `company_id`.
export const useCompanyId = () => {
  const user = useSelector((state) => state.User?.user);
  return user?.company_id ?? null;
};
