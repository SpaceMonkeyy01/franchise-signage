# Claude Code — Session Prompts

Run these in order, one session each. Each ends with something demoable. Paste the prompt verbatim; answer its questions if it asks.

---

## Session 0 — Orientation + Design Studio reconnaissance

> Read CLAUDE.md, docs/SPEC.md, and docs/flow-demo.jsx fully. Then explore reference/design-studio/ (read-only) and write docs/design-studio-findings.md answering, from the actual source code: (1) What inputs does the configurator accept and can they be preset via URL params or props (sign type, size, logo)? (2) Is the lead-capture form (name/email/phone) skippable via any flag, param, or code path? (3) How is the final price computed — is there a pricing function/API we can call headlessly? (4) What does the "preview" output consist of (image URL? canvas? 3D render?) and can it be extracted programmatically? (5) What would a minimal "franchise embed mode" require: query-param changes only, a small patch, or an API extraction? For each answer cite the file/line you based it on. Flag anything that contradicts SPEC.md §8. Do not modify anything in reference/. Finish with a one-paragraph recommendation: deep-link, iframe embed, or headless API — and what to ask Usman that the code alone can't answer.

## Session 1 — Scaffold + schema + seed

> Read CLAUDE.md and docs/SPEC.md if not in context. Scaffold the Next.js App Router + TypeScript + Tailwind project with Supabase (local dev via supabase CLI) and Resend configured via env vars. Implement the full SPEC.md §2–§5 schema as Supabase migrations: master_catalog, brands, brand_items, brand_packages, locations, installed_signs, requests, line_items, request_files, request_events, change_requests, quotes — with the enums, FKs, and RLS policies from §10 (anon scoped by access_token, authenticated team allowlist). Include the §8b fields: `requests.financing_involved` and `requests.landlord_contact`, and `landlord_criteria` in the request_files kind enum. Leave the event-kind enum open enough that the phase-2 permit stages (drawings_prepared, landlord_approved, permit_submitted, permit_issued) can be logged as events without a schema change. Write scripts/seed.ts that (a) imports docs/sign-taxonomy.tsv into master_catalog, (b) creates the Freshbites brand exactly as configured in docs/flow-demo.jsx: the 10 brand_items with pinned specs/prices/the pylon vendor override, the 3 format packages, vendor policy signage_com with corporate CC, and (c) the Oak Plaza location with its 5 installed signs. Add a status-transition helper module that enforces the §6 state machine and writes a request_event on every transition, with unit tests for: fast-lane path (submitted→approved skip), line-item derivation (pending/changes/approved), the change-request loop, and completed→installed_signs writeback including replacement upsert.

## Session 2 — Franchisee flow

> Build interface 1 from SPEC.md §9, matching docs/flow-demo.jsx screen-for-screen: the co-branded /{brand_slug} entry, tokenized request access, "Your locations" home with installed-sign records, the intent picker (add + replace_like live; modify/remove/rebrand stubbed exactly like the demo), initial-setup flow (basics+format — including the §8b financing question and optional landlord contact, plus a TBD-able lease sign-exhibit upload as a `landlord_criteria` file → package checklist with per-item config, TBD toggles, exception flagging → add-ons with prices and vendor chips → review with estimate totals and vendor-policy note → submit), the like-for-like fast lane (installed-sign picker with thumbnails → reason → optional photo → pre-approved confirmation with price → submit), and the status page (per-item statuses/prices/vendor chips, change-request callouts with real field editing on resubmit — not the demo's simulated button — quote cards, accept-quote for internal packages, production progress bar, event timeline, and a "Download budgetary quote" action once a quote exists — franchisees need it for their loan application). Real photo uploads to Supabase Storage. Generic SVG mockup renders per master render_key as the fallback thumbnail system. Mobile-responsive; franchisees will use phones on job sites.

## Session 3 — Team queue

> Build interface 2: Supabase Auth (email allowlist) admin at /admin. Request list with status filters, fast-lane badges, TBD and pending-approval rollups. Detail view matching the demo: line items with origin tags, vendor chips, prices, manual-pricing banner for standin items, files, event timeline, and the full action chain for both fulfillment tails (prepare package → [review wait] → route with per-vendor package splitting → internal: quote delivered/start production/shipped/mark installed; external: log quoted/log ordered/mark installed). "Mark installed" performs the installed_signs writeback via the session-1 helper. Manual mockup upload per line item. Package prep also carries the §8b landlord checklist flag (criteria reviewed yes/no/not provided; conflicts go through the existing exception flow) and manual `landlord_approval` event logging (sent/approved/rejected).

## Session 4 — Approval emails + change-request loop

> Build interface 3: when a request enters needs_review, send the reviewer email via Resend matching the demo's approval email — auto-approved count line, then each pending item with mockup, spec line, vendor chip, price, note field, and Approve / Request changes / Decline. Actions are signed single-use expiring links (7 days) hitting minimal public pages; request-changes requires a note. Wire the full loop: change-requested items reopen on the franchisee status page for editing and resubmission, package version increments, reviewer gets a re-review email. Implement the SLA timer (review_sla_days) as a scheduled function performing the brand's configured sla_action.

## Session 5 — Routing + notifications

> Build interfaces 4–5: the routing engine (resolve per-item vendor override ?? brand policy, group approved items into one quote package per recipient, compose the vendor email with request summary, mockups, specs, prices where direct-priced, files list, corporate CC per config; create quotes rows; write events) and the full franchisee notification set (submitted, changes requested, item approved/declined, quote ready, accepted, shipped, installed) as individual Resend templates triggered by status transitions. Then the §8b lender document set: branded PDFs on Signage.com letterhead with line items and totals, generated from data already in the request — budgetary quote (franchisee-downloadable from the status page once a quote exists), formal invoice (on internal-tail quote acceptance, team-triggered), paid receipt (team-triggered, marked PAID with date and method). Payee, amount, date, and purpose must be evident on each. No payment processing.

## Session 6 — Corporate dashboard + polish

> Build interface 6: magic-link corporate dashboard matching the demo — metrics row (locations, installed signs, open requests, awaiting approval, program spend from quotes), vendor-policy card with override note, approval-alert banner linking into a web version of the approvals view, per-location compliance cards with opening-date urgency. Then a hardening pass: empty states, loading states, error handling on all mutations, and a QA script in docs/QA.md walking the full demo storyline (setup → approve → route both tails → accept → install → verify location record).

## Session 7 — Design Studio integration (only after findings + Usman confirmation)

> Read docs/design-studio-findings.md and the confirmed integration decisions. Implement the franchise-mode integration per SPEC.md §8 at the three call sites (per-item "Instant mockup", catalog "Design & add", standalone), replacing placeholder mockups with real DS output written to line_items.mockup_file_id, and DS pricing as the quote source for direct-priced items. Preview-only terminal state; no retail checkout; validate returned sign type against the pinned brand item at package prep.

---

## Tips
- If a session balloons, stop at the demoable checkpoint and continue in a fresh session — don't let context degrade.
- After each session: run it, click through against flow-demo.jsx, and note divergences before proceeding.
- Commit before every session so any session can be reverted wholesale.
