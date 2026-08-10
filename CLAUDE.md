# Franchise by Signage — Project Memory

> Product name: **Franchise by Signage**. Never "Signize" (the engine vendor,
> invisible to users) and never "Signage Studio". Single source of truth for the
> string: `PRODUCT_NAME` in `reference/design-studio/src/brand/brandTheme.js`.

## What this is
A co-branded signage workflow portal Signage.com operates for franchise brands (pilot brand: "Freshbites", fictional). Three participants: Signage.com team (admin/queue), franchisor corporate (approvals + dashboard, no login for approvals), franchisee (tokenized links, no accounts). External vendors receive email packages only.

## Source-of-truth documents (read before writing any code)
- `docs/SPEC.md` — the build contract: full data model, status machine, approval rules, vendor routing, Design Studio integration contract, build order. Authoritative.
- `docs/flow-demo.jsx` — interactive reference implementation of the UX (all three personas, shared state). The real app's flows, screens, copy tone, and behavior should match this demo. Where SPEC.md and the demo disagree, STOP and flag it — do not guess.
- `docs/sign-taxonomy.tsv` — the master catalog seed data (Placement → Category → Sign Type → Variant + attribute matrix + pricing basis).
- `reference/design-studio/` — the existing retail Design Studio source. READ-ONLY reference: never modify it, never import from it directly. We build a wrapper around it (spec §8), not an extension of it.

## Stack (fixed decisions — do not revisit)
Next.js (App Router, TypeScript) · Supabase (Postgres, Storage; Auth only for the team admin) · Resend for all email · Vercel deploy. Tailwind for styling, matching the demo's visual language (Freshbites green #2E7D32, co-branded header, clean white cards).

## Core model (compressed; SPEC.md has details)
- Locations are permanent entities with installed-sign records. Requests are events against a location; first request is a form, later requests are lookups.
- Two-layer catalog: `master_catalog` (Signage.com taxonomy, seeded from the TSV) → `brand_items` (per-brand, pinned attributes, est_price, optional vendor_policy_override).
- Standard packages per location format load as a pre-filled checklist. Standard items auto-approve; add-ons/exceptions need corporate review; like-for-like replacements auto-approve (the "fast lane").
- Approval is LINE-ITEM level: approve / request-changes(+note, item returns to franchisee) / decline. Declines and change loops never block sibling items.
- Vendor routing resolves per item (item override ?? brand policy) and can split one request into multiple quote packages. Two lifecycle tails: internal (Signage.com fulfills: quote_ready → accepted → in_production → shipped → installed) and external (email package out; team logs milestones manually). `completed/installed` is the ONLY transition that writes installed_signs.
- TBD is always allowed on site fields — it flags team follow-up, never blocks submission.
- Direct-priced items show estimates; standin-priced items are "Custom quote" and always manually priced by the team.
- Financing is the norm, not an edge case (spec §8b): most franchisees fund signage with an SBA-style loan that disburses against vendor paperwork. The portal generates three branded PDFs from data it already holds — budgetary quote (franchisee-downloadable once a quote exists), formal invoice (on internal-tail acceptance), paid receipt (team-triggered). Documents only; no payment processing.
- Landlord approval and permits are TRACKED, not automated: `landlord_criteria` file kind + a package-prep checklist flag, and manually-logged `landlord_approval` events. Permits are log-only in MVP; phase 2 adds drawings_prepared → landlord_approved → permit_submitted → permit_issued to the internal tail, so don't preclude it in the schema. Never promise a compliance or approval outcome.

## Conventions
- Every status transition writes a request_events row (append-only; powers all timelines).
- Reviewer actions are signed, expiring, single-use email links — never a login.
- Franchisee access: `/{brand_slug}/request/{access_token}` scoped per request. RLS: anon role only reaches rows matching a presented valid token.
- Emails: one React Email/template file per notification type; send via Resend.
- Mockups: `mockup_file_id` nullable everywhere; a generic render per master `render_key` is the fallback. Do not block any flow on Design Studio availability.
- Seed script (not admin UI) configures the pilot brand: brand, brand_items, packages, master catalog import.

## Explicitly out of scope for MVP (do not build)
Modify/remove/rebrand intents (stub in UI like the demo) · franchisor self-serve onboarding · franchisee accounts · vendor portal · payment processing (the §8b lender PDFs ARE in scope — it is the money movement that isn't) · in-app messaging · CRM/ERP integrations · compliance/permit validation · permit workflow stages (phase 2) · multi-language · decline-with-alternative · per-package quote acceptance · corporate budget one-pager (v1.1).

## Known open items (build around, don't solve)
- Design Studio integration path pending confirmation (spec §8 lists the 5 requirements). Until then: placeholder mockup slots + manual team upload.
- Pilot brand's real vendor policy unknown — both routing tails must work; demo them with the Freshbites seed.

## Working style
- Follow SPEC.md §9 build order strictly; each interface should be demoable before starting the next.
- Small commits per feature. Migrations are additive.
- When the spec is silent, match the demo. When both are silent, ask — one-line question, don't build speculatively.
