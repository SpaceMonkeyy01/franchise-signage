# Franchise Signage Studio — MVP Spec v2.1

Version 2.1 · Supersedes v2 · Handoff document for implementation (Claude Code)
Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Storage, Auth for admin) + Resend + Vercel.
Companion artifacts: `docs/flow-demo.jsx` (v13) — the interactive reference the real app should match. Where this doc and the demo disagree, flag it; don't guess. `docs/FLOW.md` — the stakeholder-facing narrative of the same system (five parties, five touchpoints, outputs by stage); prose, not a build contract.
What changed in v2.1: see the changelog at the bottom. Short version: two-level access + welcome email (new MVP item), candidate-site framing for DIDs, the stamp legal design corrected, document timing clarified (Moment A vs Moment B), and new phase-2 backlog from lifecycle research.

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
| est_price | numeric nullable | estimate for direct-priced items; null → "Custom quote", manual pricing by team |
| thumbnail_url | text nullable | falls back to generic render by render_key |
| requires_review_override | boolean nullable | per-item override of brand approval rules |
| vendor_policy_override | text nullable | per-item routing override (see §4); null → brand default |
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
As v1: files (kinds: placement_photo, site_file, mockup, package_pdf, condition_photo), append-only event log powering all timelines, and change_requests for the revision loop (comment + flagged line_item ids; only flagged items reopen).

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

**Document timing, two moments (validated against SBA lending research):** the franchisee needs two different signage numbers at two different times. Moment A, before any site exists (loan pre-qualification and business plan): a format-level number only, which is the budget one-pager. Moment B, once a candidate site is at LOI and the loan is in underwriting: a site-specific number, which is the DID plus budgetary quote. Lenders require the lease, buildout budget, and contractor bids during underwriting, before any sign vendor exists. Invoice lands at fabrication (controlled disbursement), paid receipt after payment.

**Budget one-pager (MVP, decided Aug 2026):** exportable per-format signage number ("inline location signage: ~$X + custom items") so franchisors can hand prospective franchisees a number for their loan application before any request exists. It serves the two earliest touchpoints in the journey (franchise sales and loan pre-qualification) and is generated from prices already in brand_items and packages. Interface 5 scope. Corporate-triggered export plus a public brand-page download if trivial; keep it to one page.

**Never promise compliance or approval outcomes** — the portal collects, routes, generates documents, and tracks; humans judge.

## 8c. Concept Drawings Generator (DIDs) — parallel track

Franchisees applying for buildout loans need design intent drawings (DIDs): concept architectural drawings of the proposed storefront including signage. The portal generates them from data it already holds, making this the earliest monetizable touchpoint (agreement-signed / loan-application stage) and a brand-onboarding wedge.

**Flow:** franchisee authenticates with their corporate-approved brand email (pulls the magic-link auth forward from v1.1) → enters new location address + ZIP → optional current-storefront photo (fallback: Google Street View imagery for the address) → optional shop area (fallback: OpenStreetMap footprint/frontage estimate) → portal generates a concept elevation sheet: the brand's standard sign package composited onto the facade, labeled "DESIGN INTENT — NOT FOR CONSTRUCTION," plus a sign schedule with est_prices and an estimated signage investment line for the loan's use-of-proceeds breakdown → franchisee pays a fixed fee → signed copy issued as PDF.

**Two-document deliverable, decoupled on purpose:** (1) the concept drawing set — shippable immediately as an unstamped "design intent" package; the stamped tier switches on when the architect JV is signed; (2) the signage cost estimate on Signage.com letterhead — zero external dependency, this is the budgetary quote formalized.

**Candidate-site framing (copy requirement):** label the address field "candidate site," not "your location." Franchisees run DIDs while site hunting, often on two or three candidate addresses, and only one becomes real. Multiple did_requests per requester_email is normal use, not an edge case. Track the DID-to-location conversion rate; it is the funnel metric for this feature.

**New object `did_requests`:** brand_id, requester_email (brand-domain validated), address jsonb, zip, area_sqft nullable, imagery_source enum (upload | street_view | none), format_inference, drawing_file_ids, estimate_total, fee_status (unpaid | paid), payment_ref, signature_status (unsigned | intent_only | signed), signed_at, location_id nullable FK (linked when the franchisee proceeds to real setup — the DID becomes the first document in the location record and prefills address/format/photos).

**Scope changes it introduces:** brand-email magic-link auth (moved up from v1.1); Stripe checkout for the fixed fee (payments were out of scope; this is the single exception, scoped to DID fees only).

**The stamp: legal design (corrected in v2.1, replaces the earlier "review and adopt" wording):**
The seal itself can never be automated. Auto-applying an architect's seal to generated drawings is plan stamping, banned in all 50 states, and under the NCARB standard most states use, reviewing documents after they were prepared may not count as "responsible control" either. The version that survives a licensing board: the JV architect authors the drawing template and the generation rules (responsible control over the system that prepares the drawings), every output lands in their review queue, they judge each drawing (minutes at DID complexity), and they apply their own e-seal in one click. From the franchisee's side this feels automated; legally it is a controlled professional workflow. The sealing architect must also be licensed in the project's state, so the signed tier rolls out state by state and JV partner selection should weigh how many state licenses the firm holds. Team decision pending: (a) ship unstamped only and let lender calls decide whether signed is needed, or (b) build the signed tier the legal way. Recommendation: a now, b if lenders demand it. Never build any code path that applies a seal without a per-drawing architect action.

**Diligence gates before promising the stamped tier (owners: Mike/Hassan/Samiullah):**
1. Licensing lawyer sign-off on the responsible-control design above, and JV per-drawing review cost budgeted into unit economics.
2. Verify with 2–3 SBA lenders what they accept for the buildout line — an unstamped intent package + vendor budgetary quote may suffice, enabling a cheaper unstamped tier first. Also ask at which gate documentation must be site-specific (application vs closing).
3. Edge cases to design for: stale/absent Street View (new construction is the core use case), OSM giving building footprint not tenant demise width, multi-tenant frontage ambiguity. Graceful fallback: "upload a photo or we proceed with a generic elevation for your format."

## 8d. Two-level access and the franchisee welcome email (new in v2.1)

Access happens in two steps, at two different moments, because the DID is needed before the lease but the location workspace only makes sense after it.

**Level 1, at agreement signing:** corporate registers the franchisee's email in the portal (this is the same corporate approval that gates DID generation in §8c). Registration fires the **welcome email**: co-branded, sent as the brand, carrying the brand-email magic link. Content covers only what matters at signing: concept drawings and a signage number for the bank (DID + budget one-pager). Signage ordering stays invisible; nothing about it is relevant yet. Corporate's lift is one email address per new franchisee, appended to the welcome bundle they already send at countersigning.

**Level 2, after the lease:** the location workspace (tokenized links per request, as in §10), created either fresh or via the DID's convert-to-location prefill.

**Build requirements:** the welcome email is a first-class MVP deliverable — template, trigger on email registration, brand-styled sender — and belongs in interface 5 (notifications) scope. It was implicit in v2; every flow assumed the franchisee already held a link. It is the first thing a franchisee ever sees from the product.

**Adoption note for pilot setup (process, not code):** corporate's natural habit is introducing vendors after the lease, which would kill the DID window. At-signing registration must be written into the white-glove onboarding SOP and treated as a pilot success criterion. If a brand will not commit, its DID revenue quietly dies; make that trade knowingly.

**Retrofit path:** when a brand onboards with existing locations, the announcement email to existing franchisees leads with the fast lane ("replacements in about 3 clicks, it knows what is on your building"), not the DID, which is irrelevant to them.

## 9. Interfaces (build order)

1. **Franchisee flow** (public, co-branded by slug, token access):
   Home = "Your locations" (installed-sign records w/ thumbnails, open requests, "Request signage") → intent picker (add / replace live; modify / remove / rebrand stubbed) → flows: initial setup (basics+format → pre-loaded package checklist w/ per-item config, TBD toggles, exception flagging → add-ons → review w/ estimate totals + vendor-policy note → submit) · like-for-like (pick installed sign → reason → optional condition photo → pre-approved confirmation w/ price → submit) · add (catalog w/ prices, "Design & add") → status page (per-item statuses/prices, quote card, accept-quote button [internal only], production progress bar, timeline).
2. **Team queue** (Supabase Auth allowlist): request list w/ fast-lane badges and rollups; detail w/ line items+prices+TBD flags, manual-pricing banner for standin items, vendor-policy display, action chain for both tails; "mark installed" writes the location record.
3. **Approval emails + landing pages** (per-item decisions, change-request loop).
4. **Routing engine** (resolve policy incl. per-item overrides, compose + send package email, create quote row).
5. **Notification emails + lender documents**: submitted, changes requested, item approved/declined, quote ready, order accepted, shipped, installed. Plus the §8b PDF set: budgetary quote (franchisee-downloadable from the status page), formal invoice and paid receipt (team-triggered from the queue). Plus the §8d welcome email (template + trigger on corporate email registration) and the §8b budget one-pager export (per-format PDF from brand package prices, corporate-triggered).
6. **Corporate dashboard** (read-only, magic-link or simple auth): portfolio metrics (locations, installed signs, open requests, pending approvals, program spend), per-location compliance cards, jump-to-approvals.
7. **Brand admin**: seed pilot brand via script (brand, brand_items, packages, master_catalog import from the taxonomy sheet); CRUD UI only when onboarding brand #2.

## 10. Access model

Franchisee: tokenized links per request; brand entry page mints new requests. v1.1: magic-link email lookup listing "your locations" (needed for multi-unit operators). Reviewer: signed single-use expiring email links. Team: Supabase Auth allowlist. Corporate dashboard: magic link. Vendor: email only. RLS: anon role scoped by presented token.

## 11. Out of scope (MVP)

Modify/remove/rebrand intents (stub in UI) · franchisor self-serve onboarding · franchisee accounts · vendor portal · payments/deposits (single exception: the §8c Stripe checkout for DID fees) · in-app messaging · CRM/ERP integrations · compliance/permit validation · multi-language · decline-with-alternative (v1.1) · rebrand diff view (v2) · request splitting UI polish beyond basic multi-recipient send.

**Phase-2 backlog added in v2.1 (from lifecycle research; do not build, do not preclude in schema):**
- De-identification workflow: on franchise exit, all branded signage must come down, sometimes within days, with trademark law behind it. installed_signs is the removal checklist; workflow adds removal tracking and proof photos for corporate legal.
- Reimage forecasting: franchise agreements require remodel/reimage at renewal (5–15 yr terms) and often on transfer; refresh cycles now run 5–7 years. Demand can be read off agreement dates.
- Municipality variance knowledge base: which cities allow what, mined from permit outcomes in request_events. Gets more useful as history builds.
- Note on installed_signs (no schema change): the record (spec, value, photos) also works as insurance claim paperwork when a sign is destroyed. Worth mentioning in franchisee-facing copy someday.

## 12. Open questions

1. Usman: the five DS integration requirements in §8 — which are feasible, and on what timeline? Until answered, mockups are manual and est_price comes from a static field.
2. Which standin categories (esp. window vinyl/frosting if high-volume) should be promoted to direct pricing early?
3. Pilot brand's real vendor policy — determines which tail gets exercised first.
4. Pilot franchisees single- or multi-unit? (drives whether magic-link lookup moves into v1.)
5. SLA default (5 days, remind) — confirm with pilot franchisor at setup.
6. DID diligence (§8c): licensing lawyer sign-off on the responsible-control design; per-drawing review cost; SBA lender acceptance of unstamped packages and which gate needs site-specific docs; DID fee amount and Stripe account setup.
7. The stamp decision (§8c): unstamped only for now, or build the signed tier the legal way. Recommendation: unstamped first, signed if lenders demand it.
8. Business model: what does corporate pay, if anything? Assumed free-to-corporate so far, never decided.
9. Fast lane guardrails: does corporate want a dollar cap or annual limit on like-for-like auto-approval? Assumed unlimited.
10. At-signing email registration: confirmed as a corporate SOP commitment and pilot success criterion (§8d)?

Note: a fuller decision list with owners lives in the team workbook (franchise-studio-stakeholders.xlsx, Open Questions sheet). The items above are the ones that touch the build.

---

## Changelog v2 → v2.1 (Aug 2026)

- Header: companion demo is now v13 (adds the DID generator flow).
- §8b: added the two-moment document timing (format-level number pre-site, site-specific DID + quote at LOI during underwriting), validated against SBA lending research. Budget one-pager flagged as an MVP promotion candidate.
- §8c: added the candidate-site copy requirement, multiple DIDs per franchisee as normal use, and DID-to-location conversion tracking. Replaced the "review and adopt" stamp language with the responsible-control design: post-hoc review alone may not qualify as responsible control, the seal is applied by the architect per drawing, never by the system, and state licensure gates the signed tier's rollout. Diligence gate 1 now requires licensing lawyer sign-off.
- §8d (new): two-level access model and the franchisee welcome email as a first-class MVP deliverable, with the at-signing registration adoption note and the retrofit path.
- §9 interface 5: welcome email added to scope; one-pager conditionally added.
- §11: phase-2 backlog extended with de-identification workflow, reimage forecasting, municipality variance knowledge base, and the insurance-claim note on installed_signs.
- §12: new open questions (stamp decision, business model, fast-lane guardrails, at-signing registration).
- Post-changelog decision (Aug 2026): budget one-pager promoted from v1.1 to MVP; §8b and interface 5 updated accordingly.
