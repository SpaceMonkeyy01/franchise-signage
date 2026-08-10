// Role model, reduced to what the studio actually uses.
//
// The seller shell (sidebar nav, dashboards, admin portal) and its route table
// were removed with the CRM backend, so the per-route access map, the nav
// config, and the role-assignment matrix all went with them. What remains: the
// role names, their labels, and the email-based grants that useRole.js reads.

export const ROLES = {
  SIGNIZE_ADMIN: "signize_admin", // platform owner — all tenants
  COMPANY_ADMIN: "company_admin", // sign company (tenant) admin
  SALES_REP: "sales_rep", // orders + margins, no config
  USER: "user", // customer — studio only
};

export const ROLE_LABELS = {
  [ROLES.SIGNIZE_ADMIN]: "Platform Admin",
  [ROLES.COMPANY_ADMIN]: "Company Admin",
  [ROLES.SALES_REP]: "Sales Rep",
  [ROLES.USER]: "Customer",
};

// Frontend role grants by email. The backend returns `role: user` for everyone,
// so specific accounts are elevated here until real role assignment ships.
// Keys MUST be lowercase (matched case-insensitively in useRole).
export const ROLE_BY_EMAIL = {
  "saad@bluecascade.org": ROLES.SIGNIZE_ADMIN,
  "engineering.codeblue@gmail.com": ROLES.COMPANY_ADMIN,
  "usman@epiccraftings.com": ROLES.SIGNIZE_ADMIN,
};

export const isPlatformAdmin = (role) => role === ROLES.SIGNIZE_ADMIN;

// Every authenticated role lands in the studio — it is the only surface left.
export const ROLE_HOME = {
  [ROLES.SIGNIZE_ADMIN]: "/studio",
  [ROLES.COMPANY_ADMIN]: "/studio",
  [ROLES.SALES_REP]: "/studio",
  [ROLES.USER]: "/studio",
};

// No route is role-gated any more; ProtectedRoute still calls this so it stays
// as the single place to reintroduce gating if more surfaces come back.
export const canAccess = () => true;
