# Franchise by Signage — MVP Spec v2

Version 2.0 · Supersedes v1 entirely · Handoff document for implementation (Claude Code)
Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Storage, Auth for admin) + Resend + Vercel.
Companion artifact: `docs/flow-demo.jsx` (v12) — the interactive reference the real app should match. Where this doc and the demo disagree, flag it; don't guess.

---

## 1. Concept

A co-branded signage workflow portal Signage.com operates for franchise brands. Three active participants (Signage.com team, franchisor corporate, franchisee) plus passive external vendors reached by email. Core model:

- **Locations are permanent entities** with a record of installed signs. Requests are events against a location.
- Each brand predefines **standard sign packages by location format**; standard items are pre-approved and never reviewed.
- **Approval is line-item level.** Only add-ons, exceptions, and modifications reach corporate. Partial approval: approved items proceed; declined items never block the rest.
- **First request is a form; every later request is a lookup** — like-for-like replacement pulls specs from the installed record and skips review entirely (the "fast lane").
- White-glove in front: Signage.com configures everything; franchisor confirms; franchisee sees only their next action.

## 2. Two-layer catalog

### 2.1 `master_catalog` (Signage.com-owned, shared across all brands)
Seeded from the internal sign-type taxonomy (Placement → Category → Sign Type → Variant, ~70 leaf rows).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| placement | enum | `indoor` \| `outdoor` |
| category | text | e.g. "Building/Wall Signs", "Freestanding Signs", "Illuminated" |
| sign_type | text | e.g. "Illuminated Channel Letters" |
| variant | text nullable | e.g. "Face-Lit · Premium (Metallic Trim)" |
| attribute_options | jsonb | available options per attribute: mounting, material, paint_finish, fabricated_finish, return_color, trim_type, neon_color, lightbox_type, shape, char_height_band, ul_required, depth_range |
| pricing_type | text | canonical pricing model name from taxonomy |
| pricing_basis | enum | `direct` \| `standin` — standin rows have no real pricing model yet and must be quoted manually |
| render_key | text | which mockup style Design Studio / thumbnails use |
| active | boolean | |

### 2.2 `brand_items` (per-brand, created at white-glove setup)
A named brand item pins one master row's attributes. Franchisees only ever see brand items.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| brand_id | uuid FK | |
| master_catalog_id | uuid FK | |
| name | text | e.g. "Freshbites Storefront Letters" |
| pinned_attributes | jsonb | corporate-locked choices, e.g. `{ trim: "trimless", return_color: "match_logo", finish: "gloss", mounting: "standard_raceway", ul: true }` |
| site_variables | text[] | which attributes remain per-site (e.g. `["size", "mounting"]`) |
| spec_summary | text | human-readable pinned spec line for UI/emails |
| est_price | numeric nullable | estimate for direct-priced items; null ⇒ "Custom quote", manual pricing by team |
| thumbnail_url | text nullable | falls back to generic render by render_key |
| requires_review_override | boolean nullable | per-item override of brand approval rules |
| vendor_policy_override | text nullable | per-item routing override (see §4); null ⇒ brand default |
| active / sort_order | | |

## 3. Brand configuration

### 3.1 `brands`
| Field | Type | Notes |
|---|---|---|
| id, name, slug, logo_url, brand_colors | | co-branded theming; logo is the asset used for all Design Studio generations — franchisees never upload logos |
| status | enum | `draft` → `confirmed` (franchisor sign-off) → `live` \| `paused` |
| approval_mode | enum | `standard_model` (recommended: standard=auto, addon/exception/modify=review) \| `always` \| `never` |
| reviewer_email / reviewer_email_secondary | | |
| review_sla_days (default 5) / sla_action | enum | `remind` \| `escalate` \| `auto_forward` |
| vendor_policy | enum | `signage_com` \| `approved_vendor` \| `preferred_vendor` \| `corporate_first` |
| vendor_name / vendor_email | | required when policy is external |
| corporate_cc | boolean | CC corporate on routed packages |
| default_tat | text | shown to franchisees for internal fulfillment |

### 3.2 `brand_packages` — standard package per location format
| Field | Type | Notes |
|---|---|---|
| id, brand_id | | |
| format | enum | `inline` \| `endcap` \| `freestanding` (extensible per brand) |
| label / description | | |
| items | jsonb | ordered brand_item ids; duplicates allowed (endcap = 2× storefront letters) |

## 4. Vendor routing — dual fulfillment tails

Routing recipient is resolved at package-send time: per-item `vendor_policy_override` first, else brand `vendor_policy`. A single request MAY therefore split into multiple packages to different recipients (build the split; pilot will usually use one).

Two lifecycle tails after `sent_for_quote`:

- **Internal (Signage.com is vendor):** rich automated tail — quote_ready → accepted (franchisee button) → in_production → shipped → installed. Portal is system of record end to end.
- **External (approved/preferred vendor):** package emailed with mockups, specs, prices where known; corporate CC'd per config. Quoting/ordering happen off-platform. Team manually logs: vendor quoted → franchisee ordered → installed. Thin but preserves the location record and brand control.

`corporate_first` = package goes to corporate email instead of a vendor; corporate forwards manually (MVP: just a different recipient).

## 5. Core workflow objects

### 5.1 `locations`
| Field | Notes |
|---|---|
| id, brand_id, name, address jsonb, format, opening_date nullable, created_at | Requests FK to locations; no more embedded addresses |

### 5.2 `installed_signs`
| Field | Notes |
|---|---|
| id, location_id, brand_item_id | |
| sizing | text — the site-variable values as captured |
| mockup_file_id nullable | the location's actual DS mockup, cascaded from the fulfilling line item; fallback = generic brand-item render |
| source_line_item_id | provenance |
| installed_at, status `active` \| `removed`, replaced_by nullable | replacement updates the row (or supersedes it) rather than duplicating |

### 5.3 `requests` (parent)
| Field | Notes |
|---|---|
| id, brand_id, location_id | |
| intent | enum: `initial_setup` \| `add` \| `replace_like` \| `modify` (v1.1) \| `remove` (v1.1) \| `rebrand` (v1.1) |
| access_token | scopes the franchisee secure link to this request |
| status | derived — see §6 |
| requester_name / email / phone | |
| financing_involved | boolean nullable — franchisee indicates a lender is funding signage; flags the team that formal quote/invoice/receipt documents will be needed |
| landlord_contact | jsonb nullable — name/email of property manager for landlord-approval routing |
| submitted_at, created_at | |

### 5.4 `line_items`
| Field | Notes |
|---|---|
| id, request_id, brand_item_id | |
| origin | enum: `standard` \| `addon` \| `exception` \| `replacement` |
| item_status | enum: `auto_approved` \| `pending_review` \| `approved` \| `declined` |
| sizing / site_notes, tbd_fields text[] | TBD never blocks submission; flags team follow-up |
| exception_issue | text nullable — why the standard sign won't work |
| replaces_sign_id | FK installed_signs nullable (replacement intent) |
| replace_reason | enum nullable: damaged \| worn \| vandalized |
| mockup_file_id | nullable — from Design Studio (franchisee-generated or team-prepared); placeholder allowed |
| review_note | reviewer's optional condition ("approved — matte finish") |
| reviewed_at / reviewed_via_token | |

### 5.5 `request_files`, `request_events`, `change_requests`
As v1: files (kinds: placement_photo, site_file, mockup, package_pdf, condition_photo, landlord_criteria), append-only event log powering all timelines, and change_requests for the revision loop (comment + flagged line_item ids; only flagged items reopen).

### 5.6 `quotes`
| Field | Notes |
|---|---|
| id, request_id, recipient_kind (resolved policy), recipient_email, cc_email | |
| priced_total, priced_count, manual_count | manual = standin-priced items awaiting team pricing |
| external | boolean — selects the lifecycle tail |
| tat, sent_at, delivered_at, accepted_at | |

## 6. Status machine

**Item-level:** `auto_approved` (standard + like-for-like replacement) · `pending_review` (addon, exception, modify) → `approved` \| `declined` (per-item, reviewer email links). Declines never block siblings.

**Request-level (derived + team-advanced):**
```
draft → submitted → [needs_review]* → approved → sent_for_quote
   internal tail: → quote_ready → accepted → in_production → shipped → completed(installed)
   external tail: → quote_ready(logged) → accepted(logged) → completed(installed, logged)
```
`needs_review` only if any item is pending; skipped entirely when all items auto-approve (the fast lane goes submitted → approved in one step once the team preps the package). `changes_requested` branches from needs_review back via franchisee resubmission (package version increments). `completed` is the ONLY transition that writes to `installed_signs`: approved items upsert into the location record (replacement items update their target row). Every transition writes a request_event. SLA timer on needs_review per brand config.

## 7. Approval rules (the standard model)

- `standard` items in a package, unmodified → auto_approved, corporate never sees them.
- `addon` → pending_review (unless brand_item.requires_review_override = false).
- `exception` (flagged standard item) → always pending_review.
- `replacement` (like-for-like of an active installed sign) → auto_approved, always.
- Reviewer UX is email-only: signed expiring links, per-item Approve / Decline + optional note; a "changes requested" path with comment + flagged fields. Auto-approved count stated in the email ("4 standard signs auto-approved — no action needed").
- Corporate also gets a read-only dashboard (§9) but approval never requires login.

## 8. Design Studio integration

The existing retail Design Studio (placement → sign type → size slider → logo → generated 3D preview → spec sheet + price + TAT → deposit checkout) is reused via deep link / embed. Portal requirements — **confirm each with Usman before building**:

1. **Franchise/embed mode** that skips the retail lead-capture form (franchisee is already identified by token) — pass-through auth param.
2. **Preview-only terminal state**: suppress the $100-deposit checkout; terminal action returns to the portal ("Attach to request"). Ordering happens portal-side after approval, and only when Signage.com is the vendor.
3. **Deep-link params in:** master row / sign type (locked), pinned attributes, brand logo asset, size preset (from installed record for replacements), return_url with line-item token.
4. **Structured data out:** mockup image URL, chosen size, spec sheet fields, price — JSON via redirect params or webhook, written to the line item.
5. Sign-type picker locked to the brand item in franchise mode (or portal validates the returned type against the pinned spec at package prep).

Call sites: (a) per standard-package item ("Instant mockup"), (b) catalog cards ("Design & add" — creates the line item with mockup attached), (c) standalone browse. Until integration lands, mockup_file_id stays nullable and the team curates mockups manually — everything else works.

DS prices are the quote source for direct-priced items; standin items always route to manual team pricing.

## 8b. Financing, landlord approval, and permits (real-world sequence)

Most new franchisees fund signage through a lender (commonly SBA 7(a)-style loans) that pays in controlled disbursements against vendor documentation. Landlord written approval and a municipal sign permit both sit between corporate approval and fabrication. The portal's role:

**Lender document set (MVP, interface 5 scope):** generate clean branded PDFs from existing data at three moments — (1) *budgetary quote*: the request's estimate summary, downloadable from the status page once a quote exists (franchisees need this for loan applications); (2) *formal invoice*: produced when a quote is accepted on the internal tail (team-triggered); (3) *paid receipt*: team-triggered after payment, marked PAID with date and method. All three carry Signage.com letterhead, line items, and totals — lenders require payee/amount/date/purpose to be evident. No payment processing is built; documents only.

**Landlord approval (MVP: tracked, not automated):** `landlord_criteria` is a request_files kind — setup asks the franchisee to upload their lease sign exhibit (TBD allowed). Package prep includes a team checklist flag: criteria reviewed yes/no/not provided; conflicts route through the existing exception flow. `landlord_approval` request_events (sent / approved / rejected) logged manually by the team, using landlord_contact when present.

**Permits (MVP: log-only events; phase 2: a first-class stage of the internal fulfillment tail):** permit packages (elevations, site plans, mounting/electrical details, stamped engineering where required) are normally produced by the sign company — when Signage.com fulfills, this becomes part of the service. Phase 2 extends the internal tail: drawings_prepared → landlord_approved → permit_submitted → permit_issued before in_production. Do not build in MVP; do not preclude in the schema (events cover it).

**v1.1 corporate feature note:** exportable per-format budget one-pager ("inline location signage: ~$X + custom items") so franchisors can hand prospective franchisees a signage number for their loan application before any request exists.

**Never promise compliance or approval outcomes** — the portal collects, routes, generates documents, and tracks; humans judge.

## 9. Interfaces (build order)

1. **Franchisee flow** (public, co-branded by slug, token access):
   Home = "Your locations" (installed-sign records w/ thumbnails, open requests, "Request signage") → intent picker (add / replace live; modify / remove / rebrand stubbed) → flows: initial setup (basics+format → pre-loaded package checklist w/ per-item config, TBD toggles, exception flagging → add-ons → review w/ estimate totals + vendor-policy note → submit) · like-for-like (pick installed sign → reason → optional condition photo → pre-approved confirmation w/ price → submit) · add (catalog w/ prices, "Design & add") → status page (per-item statuses/prices, quote card, accept-quote button [internal only], production progress bar, timeline).
2. **Team queue** (Supabase Auth allowlist): request list w/ fast-lane badges and rollups; detail w/ line items+prices+TBD flags, manual-pricing banner for standin items, vendor-policy display, action chain for both tails; "mark installed" writes the location record.
3. **Approval emails + landing pages** (per-item decisions, change-request loop).
4. **Routing engine** (resolve policy incl. per-item overrides, compose + send package email, create quote row).
5. **Notification emails + lender documents**: submitted, changes requested, item approved/declined, quote ready, order accepted, shipped, installed. Plus the §8b PDF set: budgetary quote (franchisee-downloadable from the status page), formal invoice and paid receipt (team-triggered from the queue).
6. **Corporate dashboard** (read-only, magic-link or simple auth): portfolio metrics (locations, installed signs, open requests, pending approvals, program spend), per-location compliance cards, jump-to-approvals.
7. **Brand admin**: seed pilot brand via script (brand, brand_items, packages, master_catalog import from the taxonomy sheet); CRUD UI only when onboarding brand #2.

## 10. Access model

Franchisee: tokenized links per request; brand entry page mints new requests. v1.1: magic-link email lookup listing "your locations" (needed for multi-unit operators). Reviewer: signed single-use expiring email links. Team: Supabase Auth allowlist. Corporate dashboard: magic link. Vendor: email only. RLS: anon role scoped by presented token.

## 11. Out of scope (MVP)

Modify/remove/rebrand intents (stub in UI) · franchisor self-serve onboarding · franchisee accounts · vendor portal · payments/deposits · in-app messaging · CRM/ERP integrations · compliance/permit validation · multi-language · decline-with-alternative (v1.1) · rebrand diff view (v2) · request splitting UI polish beyond basic multi-recipient send.

## 12. Open questions

1. Usman: the five DS integration requirements in §8 — which are feasible, and on what timeline? Until answered, mockups are manual and est_price comes from a static field.
2. Which standin categories (esp. window vinyl/frosting if high-volume) should be promoted to direct pricing early?
3. Pilot brand's real vendor policy — determines which tail gets exercised first.
4. Pilot franchisees single- or multi-unit? (drives whether magic-link lookup moves into v1.)
5. SLA default (5 days, remind) — confirm with pilot franchisor at setup.
