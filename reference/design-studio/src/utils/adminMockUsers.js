// Local mock data for the admin portal. The backend has no user-management API
// yet (every /admin/users* route 404s), so the thunks in AdminUsersAction.js
// fall back to this data. Delete these once the real endpoints exist.
//
// `company_id` / `company` are assumed fields (the backend user object does not
// return them yet) — needed to scope a company_admin to their own tenant.

export const MOCK_COMPANIES = {
  1: "Acme Signs",
  2: "BrightLite Signage",
  3: "Signize",
};

// The Signize platform org. Platform admins (signize_admin) belong to it, but it
// is NOT a customer tenant — so it's excluded from tenant pickers (studio,
// pricing) via TENANT_COMPANIES below. It still resolves as a name in MOCK_COMPANIES
// so platform admins display "Signize" rather than "unassigned".
export const PLATFORM_COMPANY_ID = 3;

// Selectable customer tenants only (everything except the Signize platform org).
// Single source for the studio + pricing company pickers.
export const TENANT_COMPANIES = Object.entries(MOCK_COMPANIES)
  .filter(([id]) => Number(id) !== PLATFORM_COMPANY_ID)
  .map(([id, name]) => ({ id: Number(id), name }));

export const mockUsers = [
  {
    id: 1,
    name: "Dana Platform",
    email: "dana@signize.ai",
    role: "signize_admin",
    status: "active",
    company_id: 3,
    company: "Signize",
    created_at: "2026-01-04T10:00:00.000000Z",
  },
  {
    id: 2,
    name: "Carl Owner",
    email: "carl@acmesigns.com",
    role: "company_admin",
    status: "active",
    company_id: 1,
    company: "Acme Signs",
    created_at: "2026-01-11T10:00:00.000000Z",
  },
  {
    id: 3,
    name: "Rita Rep",
    email: "rita@acmesigns.com",
    role: "sales_rep",
    status: "active",
    company_id: 1,
    company: "Acme Signs",
    created_at: "2026-02-02T10:00:00.000000Z",
  },
  {
    id: 4,
    name: "Sam Customer",
    email: "sam@example.com",
    role: "user",
    status: "active",
    company_id: 1,
    company: "Acme Signs",
    company_name: "Sam's Coffee House",
    contact_number: "+1 (602) 555-0142",
    created_at: "2026-03-15T10:00:00.000000Z",
  },
  {
    id: 5,
    name: "Tina Suspended",
    email: "tina@example.com",
    role: "user",
    status: "suspended",
    company_id: 1,
    company: "Acme Signs",
    company_name: "Tina's Boutique",
    contact_number: "+1 (480) 555-0198",
    created_at: "2026-03-20T10:00:00.000000Z",
  },
  {
    id: 6,
    name: "Bea Owner",
    email: "bea@brightlite.com",
    role: "company_admin",
    status: "active",
    company_id: 2,
    company: "BrightLite Signage",
    created_at: "2026-01-18T10:00:00.000000Z",
  },
  {
    id: 7,
    name: "Leo Rep",
    email: "leo@brightlite.com",
    role: "sales_rep",
    status: "active",
    company_id: 2,
    company: "BrightLite Signage",
    created_at: "2026-04-01T10:00:00.000000Z",
  },
  {
    id: 8,
    name: "Mark Sales",
    email: "mark@acmesigns.com",
    role: "sales_rep",
    status: "active",
    company_id: 1,
    company: "Acme Signs",
    created_at: "2026-04-12T10:00:00.000000Z",
  },
  {
    id: 9,
    name: "Nora Sales",
    email: "nora@brightlite.com",
    role: "sales_rep",
    status: "active",
    company_id: 2,
    company: "BrightLite Signage",
    created_at: "2026-04-20T10:00:00.000000Z",
  },
];

export const mockPendingUsers = [
  {
    id: 101,
    name: "Nina Newcomer",
    email: "nina@acmesigns.com",
    role: "user",
    status: "pending",
    company_id: 1,
    company: "Acme Signs",
    company_name: "Nina's Nail Bar",
    contact_number: "+1 (602) 555-0110",
    created_at: "2026-06-08T09:30:00.000000Z",
  },
  {
    id: 102,
    name: "Omar Pending",
    email: "omar@brightlite.com",
    role: "sales_rep",
    status: "pending",
    company_id: 2,
    company: "BrightLite Signage",
    company_name: "Omar Signs Co",
    contact_number: "+1 (305) 555-0173",
    created_at: "2026-06-09T14:05:00.000000Z",
  },
  {
    id: 103,
    name: "Priya Waiting",
    email: "priya@example.com",
    role: "user",
    status: "pending",
    company_id: 1,
    company: "Acme Signs",
    company_name: "Priya's Pastries",
    contact_number: "+1 (312) 555-0125",
    created_at: "2026-06-10T08:15:00.000000Z",
  },
];
