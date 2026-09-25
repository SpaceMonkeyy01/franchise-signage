# Spec v2.3 proposal — accounts, roles, and brand portals

Status: **DRAFT for review, not the contract.** `docs/SPEC.md` (v2.2) stays
authoritative until this is approved. On approval, its sections fold into SPEC.md
as v2.3, CLAUDE.md drops "franchisee accounts" from out-of-scope, and the build
order in §9 below replaces "Session 7 or 8, both gated" as what is next.

Drafted 25 Sep 2026.

---

## 1. The change in one paragraph

Everyone except vendors gets an account and signs in with an email and a
password. Email links are used only for the things email is for: accepting an
invitation and resetting a password. Nobody signs up on their own. Signage.com
creates a brand, and from then on each account is created by an **invitation**
from someone above it. Signage.com invites the brand's admins. A brand admin
invites franchisees and corporate reviewers. A franchisee owner invites their own
store staff. What a person can see and do is set by a **role on a brand**, and
for franchisees also by **which stores they own or are assigned to**. Each brand
gets its own address (`freshbites.signage.com`) where its admins and franchisees
sign in. The one-click approve buttons in the email stay.

## 2. Why now, and what it replaces

v2.2 deliberately had no logins outside the team (§10). That kept the first
contact easy, and it has run into its limits:

- **Multi-store franchisees have no home.** Every request is its own link, so an
  operator with five stores keeps five or more emails and has no "my stores"
  view. §10 already planned a "your locations" lookup for v1.1, and §12 Q4 asked
  whether multi-unit pilots would pull it into v1. The answer is yes.
- **Corporate can't approve from the dashboard.** The dashboard link is a
  30-day, multi-use bookmark, too weak a credential to carry approval authority,
  so the approvals tab can only show (DECISIONS #75). A signed-in reviewer
  removes that problem.
- **A lost email means a support call.** With no account, nobody can recover a
  link themselves.
- **The DID flow already assumes an account.** §8c authenticates the franchisee
  with a brand-email magic link. That is a sign-in, and v2.2 was going to build
  it as a one-off.

This proposal replaces the per-request link as the franchisee's primary way in,
the corporate dashboard link, the team allowlist and the §8c one-off sign-in with
one identity system. It does **not** replace the reviewer's email buttons (§6).

## 3. Roles

A person can hold several memberships, for example an admin at two brands, or a
franchisee owner who is also staff somewhere else. Each membership is one row:
**who, which brand, which role**, plus a store scope for staff.

| Role | Scope | Held by |
|---|---|---|
| `platform_admin` | Every brand | The Signage.com team. Replaces `team_members`. |
| `brand_admin` | One brand, everything in it | Franchisor corporate: the program owner. |
| `brand_reviewer` | One brand, approvals and reading | Franchisor staff who approve signage. |
| `franchisee_owner` | One franchisee company's stores | The franchisee. |
| `franchisee_staff` | Named stores only | A store manager, invited by the owner. |

**A franchisee is a company, not an email address.** A new `franchisees` record
(one company under a brand) owns stores, and people belong to it. If the
franchisee were one email address, a store would be orphaned the first time its
manager changed. Stores (`locations`) gain a `franchisee_id`.

## 4. Who can do what

✓ = can do · — = cannot see or do · "own" = only the franchisee's own stores ·
"assigned" = only the stores the staff member is assigned to.

| Capability | platform_admin | brand_admin | brand_reviewer | franchisee_owner | franchisee_staff |
|---|---|---|---|---|---|
| See all brands | ✓ | — | — | — | — |
| See every store and request in the brand | ✓ | ✓ | ✓ | own | assigned |
| Start a request, replace a sign | ✓ | — | — | own | assigned |
| Answer a change request, resubmit | ✓ | — | — | own | assigned |
| **Accept a quote** (commits money) | ✓ | — | — | own | — |
| Download budgetary quote, invoice, receipt | ✓ | ✓ | — | own | — |
| Generate a DID (§8c) | ✓ | — | — | ✓ | — |
| **Approve / decline / request changes** | ✓ | ✓ | ✓ | — | — |
| Corporate dashboard, budget one-pager export | ✓ | ✓ | ✓ | — | — |
| Invite or deactivate brand admins and reviewers | ✓ | ✓ | — | — | — |
| Invite a franchisee (the §8d registration) | ✓ | ✓ | — | — | — |
| Invite or deactivate store staff | ✓ | ✓ | — | own stores | — |
| Prepare packages, price, route, fulfil, invoice | ✓ | — | — | — | — |
| Create a brand, edit the catalog or packages | ✓ | — | — | — | — |

Four lines deserve a note:

- **Accepting a quote is owner-only.** It is the point where money is committed,
  and on the internal tail it produces the invoice a lender pays against. Staff
  can prepare everything up to it. (Decision D2.)
- **Corporate never edits a franchisee's request.** Corporate approves items or
  sends them back with a note. The franchisee changes their own request. This is
  the v2.2 rule, and accounts don't loosen it.
- **Only Signage.com runs the service side.** Package prep, pricing, routing and
  fulfilment stay with `platform_admin`. A brand admin has full access to the
  brand's program, not to Signage.com's operations.
- **Creating a brand stays white-glove.** A brand admin can invite people into a
  brand that exists. They cannot create one. "Franchisor self-serve onboarding"
  stays out of scope.

## 5. Invitations and sign-in

### 5.1 One invitation mechanism

| Field | Notes |
|---|---|
| id, brand_id, email, role | the role the invitee gets on accepting |
| franchisee_id nullable | for franchisee roles; a new franchisee company is created with the invite |
| location_ids uuid[] nullable | for `franchisee_staff` |
| invited_by (membership id), created_at | |
| token_hash, expires_at (14 days), accepted_at, revoked_at | hashed, like review and corporate links |

Accepting an invitation creates the membership. It is single-use and expires. An
admin can re-send it, which replaces the token and kills the old one, or revoke
it.

**The §8d registration becomes a franchisee invitation.** Corporate registers a
franchisee's email at agreement signing, as today. That creates a `franchisees`
record and an owner invitation, and **the welcome email carries the invitation**.
The welcome email's content is unchanged: the DID and the budget number, with
ordering absent. The difference is that the link now leads to an account that
will still be there after the lease. `franchisee_registrations` either migrates
into `invitations` or stays as the record of the §8d event and points to one.
That's an implementation detail, but the §8d welcome email must not change
behaviour.

### 5.2 Accepting an invitation: sign up, then set up

The invitation email carries one link. Opening it:

1. **Confirms the email address.** The invitation token proves it, so there is
   no separate "verify your email" step.
2. **Creates the account.** Name, phone, and a password. For a franchisee owner,
   also the company name, which creates the `franchisees` record.
3. **Continues into setup, depending on the role:**
   - **Franchisee owner, with a site:** straight into the existing initial-setup
     flow (store basics and format, the standard package checklist, add-ons,
     submit). The store is created owned by their company.
   - **Franchisee owner, no site yet:** the §8d level-1 page (DID and budget
     number), with "Set up a store" waiting for when the lease is signed.
     Ordering stays out of sight until then, as §8d requires. (Decision D7.)
   - **Store staff:** straight to their assigned stores.
   - **Brand admin or reviewer:** straight to the dashboard.

The link is single-use. Once the account exists, the same link says "this
invitation has been accepted — sign in" rather than failing.

**The invite link works on any device.** It is our own hashed token, not a
Supabase magic link, so it avoids the PKCE rule that ties a Supabase link to the
browser that requested it (DECISIONS #108). That matters because a franchisee's
first visit is often on a phone.

### 5.3 Signing in

- **Email and password**, through Supabase Auth, which the team sign-in already
  uses. One sign-in page per brand address (§6), plus the console's.
- **Password rules:** a minimum of 10 characters, and Supabase's leaked-password
  check (a paid-plan feature). Repeated failures are rate-limited and then
  locked for a period; Supabase provides both, and we set the limits.
- **Forgot password** sends a reset link. That email must use the token-hash
  template, not Supabase's default PKCE link, so it works when opened on a
  different device from the one that asked for it. Same fix #108 names.
- **Two-factor:** required for `platform_admin`, whose account reaches every
  brand, through an authenticator app (Supabase supports it). Optional for
  everyone else, and a brand can require it of its own admins (decision D8).
- **The allowed-domain rule stays.** A brand keeps its list of approved franchisee
  email domains (§8c). An invitation to an address outside the list is refused,
  or warned about (decision D5).
- **Sessions:** 30 days for franchisee and brand roles, and 12 hours for
  `platform_admin`, which has access to every brand. Supabase sets one session
  length for the whole project, so the shorter limit is enforced by the app
  checking the sign-in time on each request. Deactivating a membership
  takes effect on the next request, as the team allowlist does today (tested in
  Session 6d).

### 5.4 What happens to the links that exist today

| Link | Under v2.3 |
|---|---|
| Reviewer's approve / decline / changes buttons | **Unchanged.** Signed, single-use, 7 days. |
| Franchisee's per-request link in notifications | **Kept as a shortcut** during the pilot (decision D1). |
| Corporate dashboard link (`corporate_links`) | **Retired** once brand roles are live. The dashboard sits behind sign-in. |
| Welcome link (`franchisee_registrations.access_token`) | **Becomes** the owner invitation. |
| Team allowlist (`team_members`) | **Migrated** into `platform_admin` memberships. |

**Reviewers keep the email buttons.** Approving straight from the inbox is the
product's fastest path, and the reason corporate goes along with any of this. A
signed-in reviewer can also decide from the dashboard, which resolves #75. Both
routes call the same decision code and write the same `request_events`, with the
actor recorded as either `via_link` or `via_session`.

## 6. Brand portals: `{brand}.signage.com`

- **One address per brand**, for example `freshbites.signage.com`. It serves that
  brand's sign-in, franchisee home, and corporate dashboard. The Signage.com
  console sits on its own address, for example `franchise.signage.com/admin`.
- **It routes to the pages that already exist.** The request resolves the
  subdomain to a brand, and `freshbites.signage.com/…` serves what
  `/freshbites/…` serves today. The path-based URLs keep working, so nothing is
  rebuilt and local development needs no DNS.
- **Each brand gets its own sign-in session.** Sessions are scoped to the brand's
  address, so being signed in at Freshbites doesn't carry over to another brand.
  That fits co-branding. Anyone who belongs to two brands signs in at each.
- **Needs from outside the code:** wildcard DNS and a wildcard certificate for
  `*.signage.com` on the host, and a wildcard redirect URL in the Supabase auth
  settings. None of this blocks the rest of the plan. Subdomains are the last
  phase (§9).

## 7. Data model changes (additive)

| Change | Notes |
|---|---|
| `profiles` | id = the Supabase Auth user id; email, name, created_at |
| `franchisees` | id, brand_id, name (the company), created_at |
| `memberships` | id, profile_id, brand_id nullable (null only for platform_admin), role, franchisee_id nullable, active, created_at |
| `membership_locations` | membership_id, location_id — the staff scope |
| `invitations` | §5.1 |
| `locations.franchisee_id` | nullable FK; backfilled (§8), then required for new stores |
| `requests.created_by` | nullable profile id. `requester_*` stays: it is contact data, not identity |
| `brands.franchisee_email_domains` | text[] — the §8c approved-domains list made concrete |

Nothing is dropped in the same release. `team_members` and `corporate_links` go
read-only, and are removed one release after their replacements have run in
production.

**RLS.** Two helper functions answer every question: `app.brand_role(brand_id)`
returns the caller's highest role on a brand, and `app.can_see_location(location_id)`
answers the owner and staff scope. Policies are written against those two, and
the per-request token policies stay beside them for as long as D1 keeps the
links. The behaviour suite (`npm run db:verify`) gains a check for each role
against the two-brand fixture. That includes the ones that matter most: staff
can't see a store they aren't assigned to, an owner can't see a sibling
franchisee's stores, and a brand admin can't write a request.

## 8. Migrating what exists

- **Team:** each active `team_members` row becomes a profile plus a
  `platform_admin` membership, and gets an invitation to set a password and
  enrol two-factor. Until they accept it, their current sign-in keeps working.
- **Stores:** each location's owner is inferred from the `requester_email` of its
  earliest request. The team reviews that list before it is applied. An inferred
  owner is a guess, and a wrong one would show a stranger someone else's store.
  Stores nobody can attribute stay unowned and visible only to the brand and the
  team until someone is invited.
- **Registrations:** each `franchisee_registrations` row becomes a franchisee
  company plus a pending owner invitation. Nobody is emailed automatically.
- **Pilot seed:** Freshbites gets a brand admin (`brand@freshbites.com`), a
  reviewer, and one franchisee company owning Oak Plaza and Cedar Park, so every
  role can be demonstrated from `npm run dev`.

## 9. Build order

Each phase can be demonstrated on its own, and none requires the next.

| Phase | Delivers | Demo |
|---|---|---|
| **A. Identity core** | profiles, memberships, invitations and their accept page (create account, set password), email + password sign-in, forgot password, two-factor for `platform_admin`, `platform_admin` replacing the allowlist, the RLS helpers and their tests | A team member accepts an invite, sets a password and two-factor, signs in; deactivation still locks them out |
| **B. Franchisee accounts** | franchisee companies, store ownership + backfill, welcome email = invitation, sign-up continuing into store setup or the level-1 page (§5.2), a "My stores" home across all of a franchisee's stores, DID sign-in built on this | Corporate invites a franchisee, who signs up, sets up a store, and later sees both stores and every request |
| **C. Corporate in-app** | brand_admin and brand_reviewer, the dashboard behind sign-in, approve from the dashboard, invite and deactivate users, `corporate_links` retired | A reviewer approves from the dashboard, and the same item's email button then says it's already decided |
| **D. Staff + brand portals** | `franchisee_staff` with store assignment, owner invites staff, `{brand}.signage.com` routing | A manager sees one store of two; freshbites.localhost serves the brand |

Phase B has one dependency that isn't built yet: the DID screens still wait on the
v13 demo. Phase B builds the sign-in the DID uses, not the DID itself.

The `/admin/demo` walkthrough keeps working throughout. Under accounts it should
become "view as", showing exactly what a chosen member sees. That is a
`platform_admin` capability, and every "view as" session is written to the
event log.

## 10. Decisions for you

Each has a recommended default, and the draft above is written to that default.

- **D1. Keep the per-request links?** *Recommended: yes, for the pilot.* A
  notification link that opens the request with one tap is worth keeping, and it
  is no weaker than today. The alternative, "sign in to view", is more
  consistent, adds a step to every notification, and can be switched per brand
  later. Accepting a quote goes owner-only either way, so a forwarded link can
  view a request and cannot commit money.
- **D2. Store staff in the first version?** *Recommended: in the data model now,
  in the UI in phase D.* Modelling it later would mean moving ownership from
  people to companies after the fact, which is the expensive part. The invite
  screen is cheap and can wait.
- **D3. Can a brand admin do everything a reviewer can?** *Recommended: yes.*
  Admin includes reviewer. The alternative is for franchisors who want
  approvers and administrators kept strictly apart.
- **D4. What happens to `reviewer_email` on the brand?** *Recommended: it stays as
  the escalation and SLA address* (§3.1). Approval emails go to every
  `brand_reviewer`, or to the configured address if the brand has none yet.
- **D5. An invitation outside the brand's email domains?** *Recommended: warn,
  then allow.* Franchisees use personal and company addresses in practice.
  §8c's hard domain rule was written for a DID sign-in anyone could request,
  where nobody vouched for the person. An invitation is that voucher.
- **D6. The Signage.com console's address.** `franchise.signage.com/admin`, or
  `admin.signage.com`? A naming decision, nothing more.
- **D7. A franchisee invited before they have a site.** *Recommended: sign-up
  lands on the level-1 page (DID and budget number), and "Set up a store"
  appears there for when the lease is signed.* That keeps §8d's rule that
  ordering is out of sight at agreement signing, and it still gets the account
  created at the earliest moment. The alternative, always going straight into
  store setup, suits brands that invite franchisees only once a site exists, and
  could be a per-brand setting.
- **D8. Two-factor beyond Signage.com admins?** *Recommended: optional for
  everyone else, with a per-brand switch to require it for that brand's admins
  and reviewers.* Franchisor IT departments often ask for it; forcing it on
  franchisees would cost sign-ups for little gain.

## 11. What stays out of scope

Social sign-in ("Sign in with Google") · franchisor self-serve brand creation · vendor
accounts (vendors stay email-only) · permissions finer than the five roles ·
single sign-on with a franchisor's identity provider (a likely enterprise ask
later; nothing here blocks it, because Supabase Auth supports SAML) · in-app
messaging.
