# Franchise by Signage — Project Memory

> Product name: **Franchise by Signage**. Never "Signize" (the engine vendor,
> invisible to users) and never "Signage Studio". Single source of truth for the
> string: `PRODUCT_NAME` in `reference/design-studio/src/brand/brandTheme.js`.

## What this is
A co-branded signage workflow portal Signage.com operates for franchise brands (pilot brand: "Freshbites", fictional). Three participants: Signage.com team (admin/queue), franchisor corporate (approvals + dashboard, no login for approvals), franchisee (tokenized links, no accounts). External vendors receive email packages only. A parallel DID track (spec §8c) serves franchisees at the loan stage, before any location exists.

## Source-of-truth documents (read before writing any code)
- `docs/SPEC.md` — the build contract (currently spec v2.1): full data model, status machine, approval rules, vendor routing, Design Studio integration contract, DID module, two-level access, build order. Authoritative.
- `docs/flow-demo.jsx` — interactive reference implementation of the UX (all three personas, shared state). The real app's flows, screens, copy tone, and behavior should match this demo. Where SPEC.md and the demo disagree, STOP and flag it — do not guess. **Note: the file on disk is v12. Spec v2.1 and Session 8 reference a v13 demo that adds the DID generator screens; it has not landed in the repo yet.**
- `docs/sign-taxonomy.tsv` — the master catalog seed data (Placement → Category → Sign Type → Variant + attribute matrix + pricing basis).
- `docs/FLOW.md` — stakeholder-facing narrative of the whole system (five parties, the five points signage enters a franchisee's journey, outputs by stage). Context and language, NOT a build contract: where it disagrees with SPEC.md or the demo, they win.
- `claude-code-sessions.md` — the session-by-session build plan (Sessions 0–8), aligned to spec v2.1.
- `reference/design-studio/` — the existing retail Design Studio source. READ-ONLY reference: never modify it, never import from it directly. We build a wrapper around it (spec §8), not an extension of it.

## Stack (fixed decisions — do not revisit)
Next.js (App Router, TypeScript) · Supabase (Postgres, Storage; Auth only for the team admin) · Resend for all email · Vercel deploy. Tailwind for styling, matching the demo's visual language (Freshbites green #2E7D32, co-branded header, clean white cards). Stripe for exactly one thing: the DID fee (see below).

## Core model (compressed; SPEC.md has details)
- Locations are permanent entities with installed-sign records. Requests are events against a location; first request is a form, later requests are lookups.
- Two-layer catalog: `master_catalog` (Signage.com taxonomy, seeded from the TSV) → `brand_items` (per-brand, pinned attributes, est_price, optional vendor_policy_override).
- Standard packages per location format load as a pre-filled checklist. Standard items auto-approve; add-ons/exceptions need corporate review; like-for-like replacements auto-approve (the "fast lane").
- Approval is LINE-ITEM level: approve / request-changes(+note, item returns to franchisee) / decline. Declines and change loops never block sibling items.
- Vendor routing resolves per item (item override ?? brand policy) and can split one request into multiple quote packages. Two lifecycle tails: internal (Signage.com fulfills: quote_ready → accepted → in_production → shipped → installed) and external (email package out; team logs milestones manually). `completed/installed` is the ONLY transition that writes installed_signs.
- TBD is always allowed on site fields — it flags team follow-up, never blocks submission.
- Direct-priced items show estimates; standin-priced items are "Custom quote" and always manually priced by the team.
- Financing is the norm, not an edge case (spec §8b): most franchisees fund signage with an SBA-style loan that disburses against vendor paperwork. Two moments need two numbers: format-level before a site exists (budget one-pager), site-specific once a candidate site is at LOI (DID + budgetary quote, during loan underwriting). The portal generates three branded PDFs from data it already holds — budgetary quote (franchisee-downloadable once a quote exists), formal invoice (on internal-tail acceptance), paid receipt (team-triggered), plus the budget one-pager (MVP as of Aug 2026: per-format signage number from package prices, corporate-triggered export). Documents only; no payment processing.
- **DID generator (spec §8c, parallel track):** brand-email magic-link auth → candidate-site address + ZIP → optional photo (Street View fallback) → optional area (OSM fallback) → concept elevation sheet labeled "DESIGN INTENT — NOT FOR CONSTRUCTION" + sign schedule with est_prices + investment line → fixed fee via Stripe → PDF. `did_requests` is decoupled from `locations` on purpose: label the address field "candidate site"; several DIDs per franchisee while site hunting is normal use; a paid DID converts into location setup via prefill. Track DID-to-location conversion.
- **The stamp (hard rule):** never build any code path that applies an architect seal without a per-drawing architect action. Auto-applied seals are plan stamping, illegal in all 50 states. MVP ships the unstamped intent tier only; `signature_status` stays `unsigned | intent_only` until the signed tier is approved (spec §8c has the legal design if it comes).
- **Two-level access (spec §8d):** Level 1 at agreement signing — corporate registers the franchisee's brand email, which fires the co-branded **welcome email** (a first-class MVP template: DID + budget number only, ordering invisible). Level 2 after the lease — the tokenized location workspace, created fresh or from a DID conversion.
- Landlord approval and permits are TRACKED, not automated: `landlord_criteria` file kind + a package-prep checklist flag, and manually-logged `landlord_approval` events. Permits are log-only in MVP; phase 2 adds drawings_prepared → landlord_approved → permit_submitted → permit_issued to the internal tail, so don't preclude it in the schema. Never promise a compliance or approval outcome.

## Conventions
- Every status transition writes a request_events row (append-only; powers all timelines).
- Reviewer actions are signed, expiring, single-use email links — never a login.
- Franchisee access: `/{brand_slug}/request/{access_token}` scoped per request. RLS: anon role only reaches rows matching a presented valid token. DID access: brand-email magic link, domain validated against the brand's approved list.
- Emails: one React Email/template file per notification type; send via Resend. The welcome email (trigger: corporate registers a franchisee email) is part of this set, not an afterthought — it is the first thing a franchisee ever sees.
- Mockups: `mockup_file_id` nullable everywhere; a generic render per master `render_key` is the fallback. Do not block any flow on Design Studio availability.
- Seed script (not admin UI) configures the pilot brand: brand, brand_items, packages, master catalog import.

## Explicitly out of scope for MVP (do not build)
Modify/remove/rebrand intents (stub in UI like the demo) · franchisor self-serve onboarding · franchisee accounts · vendor portal · payment processing beyond the single Stripe exception for DID fees (the §8b lender PDFs ARE in scope — it is signage-order money movement that isn't) · in-app messaging · CRM/ERP integrations · compliance/permit validation · permit workflow stages (phase 2) · multi-language · decline-with-alternative · per-package quote acceptance · the signed/stamped DID tier (pending the stamp decision) · phase-2 lifecycle features (de-identification workflow, reimage forecasting, municipality variance knowledge base — events already cover them, build nothing).

## Known open items (build around, don't solve)
- Design Studio integration path pending confirmation (spec §8 lists the 5 requirements). Until then: placeholder mockup slots + manual team upload.
- Pilot brand's real vendor policy unknown — both routing tails must work; demo them with the Freshbites seed.
- The stamp decision (unstamped-only vs signed tier) is with the team; the safe default is built into the rules above.
- Business model (what corporate pays) undecided; nothing in the build depends on it.
- DID fee amount is a placeholder ($499); make it config, not a constant.
- The v13 flow demo (DID screens) is not in the repo yet — Session 8 is blocked on it, and any DID UX built before it arrives is a guess.

## Working style
- Follow SPEC.md §9 build order strictly; each interface should be demoable before starting the next. The DID module is Session 8, gated on corporate template sign-off and a Stripe account.
- Small commits per feature. Migrations are additive.
- When the spec is silent, match the demo. When both are silent, ask — one-line question, don't build speculatively.
