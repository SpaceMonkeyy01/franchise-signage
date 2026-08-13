# Franchise by Signage - Complete Flow Document

Working document, consolidates the full flow across all parties. Companion to `docs/SPEC.md` (build contract) and `docs/flow-demo.jsx` v12 (interactive reference). Written for stakeholders first, builders second. Where this document and SPEC.md or the demo disagree, they win — this one carries the narrative, not the contract.

---

## 1. The idea in one paragraph

Signage.com runs a co-branded portal for franchise brands. Corporate locks the brand's signage decisions once. Franchisees get a simple guided flow where their required signs come pre-loaded and pre-approved. Corporate only reviews what deviates. Signage.com operates the whole thing, prepares the packages, routes the quotes, and keeps a permanent record of every sign at every location. The franchisee's real problem is not ordering a sign, it is coordinating five parties (corporate, landlord, city, bank, vendor) who all need consistent documents about the same sign. The portal is the single source of truth those documents flow from.

## 2. The parties

Three active in the portal (franchisee, corporate, Signage.com team), three passive and reached by email (landlord/city, lender, external vendor).

| Party | Role | Access |
|---|---|---|
| Franchisee | Requests signage for their location(s) | Tokenized links, no login |
| Franchisor corporate | Owns brand standards, approves exceptions, watches the portfolio | Email links for approvals, magic-link dashboard |
| Signage.com team | White-glove setup, runs the queue, prepares packages, routes quotes, fulfills when chosen | Authenticated admin |
| Landlord / city | Approve the sign before fabrication (written consent, permit) | Email only, tracked by the team |
| Bank / lender | Funds the buildout, pays vendor invoices in controlled disbursements | Receives documents, never touches the portal |
| External vendor | Quotes and fulfills when brand policy routes away from Signage.com | Receives the package email, works off-platform |

## 3. When signage enters the franchisee's journey

Five touchpoints, in order:

1. **A cost line (discovery).** Signage appears as an estimate range in Item 7 of the FDD. Nobody acts on it yet.
2. **A budget number (agreement signed).** Corporate hands the new franchisee a per-format budget one-pager ("inline location signage: ~$X plus custom items"), generated from the standard package prices. The portal exports it in MVP (corporate-triggered), and the same moment fires the welcome email that gives the franchisee their brand-email access.
3. **A loan line item (financing).** The franchise agreement is signed before the loan is approved. Lenders require franchisor approval and review the agreement. Signage is a named use-of-proceeds line, and the budgetary quote is the document behind the number.
4. **The active project (buildout).** Lease signed, sign criteria arrives, the portal flow runs: request, approvals, landlord, permit, fabricate, invoice, install. Under time pressure, because opening day is fixed and permits take 2 to 8 weeks.
5. **The long tail (operations).** Replacements, additions, eventual rebrands. The location record makes each one a lookup instead of a project.

Traditional vendors only exist at touchpoint 4. The portal is present at all five.

## 4. One-time setup (per brand, white-glove)

1. Signage.com walks corporate through the master catalog (the full sign taxonomy) and pins the brand's choices into named brand items, e.g. "Freshbites Storefront Letters: face-lit premium channel letters, trimless, match-logo returns, gloss, standard raceway, UL listed." Only site facts (size, mounting, pane count) stay variable.
2. Standard packages are defined per location format (inline, endcap, freestanding). Each is a list of brand items, pre-approved.
3. Vendor policy is set, one of four: Signage.com direct, approved vendor, preferred vendor, or corporate-first (the package goes to corporate rather than a vendor, and corporate forwards it). Corporate CC preference is set alongside it. Individual brand items can override the policy (e.g. pylons always go to a local fabricator).
4. Approval rules, reviewer contact, SLA behavior, and estimated prices are configured.
5. Corporate confirms with a preview of the franchisee experience. Brand goes live. Franchisees get their links.

Recommended division of labor: corporate owns the decisions, Signage.com does the labor.

## 5. Franchisee flows

### 5a. New location setup
1. Open co-branded link. Home shows "your locations."
2. Location basics: name, address, opening date, contact, is a lender funding this (yes/no), location format. Format loads the standard package.
3. Upload the lease sign criteria (the sign exhibit, often Exhibit C), TBD allowed. Full lease is never requested. Site plan or floor plan optional, usually the GC or architect has it, not the franchisee.
4. The pre-loaded checklist: "your location requires these N signs," each pre-approved. Per sign: placement photo, sizing or TBD, optional instant mockup via Design Studio. If a standard sign will not work at the site (landlord bans illumination, facade too small), flag it, that item becomes an exception needing corporate review.
5. Optional add-ons from the approved catalog, each marked "needs corporate approval," with prices and fulfillment vendor shown. "Design and add" opens Design Studio, generates the mockup, and adds the item with the mockup attached.
6. Review and submit: two groups shown, "proceeding immediately" (standard items) and "going to corporate" (add-ons, exceptions), with an estimated total and the vendor policy note. One submission covers the whole location.
7. Status page (same link): per-item statuses, prices, vendors, change-request callouts, quote card, accept button when applicable, production progress, full timeline.

### 5b. Follow-on requests (existing location)
Intent picker, approval path shown up front:
- **Add a new sign:** catalog flow, needs corporate approval.
- **Replace like-for-like (the fast lane):** pick the installed sign, state the reason (damaged, worn, vandalized), optional condition photo, confirm, submit. Specs come from the installed record. Skips corporate review entirely, and the price is shown before submitting.
- **Modify, remove, rebrand:** v1.1, stubbed in the UI.

Principle throughout: the franchisee uploads photos and the sign exhibit, answers site facts, and nothing else. Measurements they do not know are TBD. Engineering, drawings, and interpretation are the team's job. TBD never blocks submission.

## 6. Signage.com team flow

1. **Queue:** every request across locations, with status, fast-lane badges, TBD flags, pending-approval counts.
2. **Package prep:** review inputs, chase TBDs, read the landlord criteria and mark it reviewed (yes / no / not provided), flag conflicts as exceptions, attach or generate mockups, then prepare the package. Standard-only requests skip straight to approved; anything pending triggers the corporate approval email.
3. **Routing (after approval):** resolve each item's vendor (item override, else brand policy), group into one quote package per vendor, email each package (summary, mockups, specs, prices where known, files), corporate CC per config. A single request can split across vendors.
4. **Internal tail (Signage.com is the vendor):** mark quote delivered, wait for franchisee acceptance, start production, mark shipped, mark installed. Landlord submittal and permit package sit between approval and production (MVP: team handles and logs them, phase 2: first-class stages).
5. **External tail (outside vendor):** the vendor quotes and fulfills off-platform. Team logs the milestones: vendor quoted, franchisee ordered, installed.
6. **Mark installed** is the step that writes approved items into the location's installed-sign record. Both tails end here. This is what makes every future request cheap.

## 7. Corporate flow

- **Approvals (email, no login):** arrives only when something deviates. The email says "N standard signs auto-approved, no action needed," then each pending item with mockup, spec, vendor, price, and three choices: approve (optional condition note), request changes (note required, item goes back to the franchisee to update and resubmit), decline. Decisions are per item, nothing blocks anything else.
- **Dashboard (magic link):** portfolio metrics (locations, installed signs, open requests, pending approvals, program spend), vendor policy display, per-location compliance cards with opening-date urgency, jump into approvals.
- **If corporate goes quiet:** each brand configures a review SLA (default 5 days) and what happens when it lapses — remind, escalate to the secondary reviewer, or auto-forward. Nothing stalls silently.
- What corporate never sees: standard items and like-for-like replacements. That is the deal that makes the program low-burden.

## 8. Approval model summary

| Item origin | Review? |
|---|---|
| Standard package item, unmodified | Auto-approved, corporate never sees it |
| Add-on from the catalog | Corporate reviews (per-item override possible) |
| Exception (standard sign flagged as unworkable) | Always reviewed |
| Like-for-like replacement of an installed sign | Auto-approved, always (the fast lane) |
| Modify / remove / rebrand | Reviewed (v1.1) |

Reviewer choices per item: approve, request changes (with note, loops back to franchisee), decline. Partial approval is the rule: approved items proceed to quote while others loop or die.

## 9. The approval gauntlet beyond corporate

Order of gates before fabrication: corporate approval (the fast step), landlord written approval, city sign permit.

- **Landlord:** the lease sign exhibit governs sign type, size formulas, placement band, illumination, colors, raceway, and requires written approval of drawings before fabrication. The portal collects the exhibit at setup, the team interprets it, conflicts become exceptions, and the landlord submittal and response are logged as events (landlord contact stored on the request).
- **City:** permit package (site plan, elevations, mounting and electrical details, stamped engineering where required, landlord consent letter). 2 to 8 weeks typical, 20 to 40 percent of applications get returned for incompleteness. MVP: log-only events. Phase 2, internal tail: drawings prepared, landlord approved, permit submitted, permit issued become tracked stages, and producing the permit package is part of Signage.com's service.
- The portal never promises compliance or approval outcomes. It collects, routes, generates documents, and tracks. Humans judge.

## 10. Money flow

Most new franchisees fund signage through a lender (commonly SBA 7(a) style), which pays in controlled disbursements against vendor documentation, often directly to the vendor. Three documents at three moments, all generated from portal data:

1. **Budgetary quote**, early, for the loan application (and the pre-request budget one-pager at agreement signing).
2. **Formal invoice**, when the quote is accepted, for the lender's disbursement.
3. **Paid receipt**, marked paid with date and method, for the lender's file.

Lenders need payee, amount, date, and purpose evident on every document. No payment processing in the portal, documents only. A vendor whose paperwork sails through lender review is the vendor franchisees and banks prefer.

## 11. Status machine (request level)

```
draft > submitted > [needs_review]* > approved > sent_for_quote
  internal tail: > quote_ready > accepted > in_production > shipped > completed (installed)
  external tail: > quote_ready (logged) > accepted (logged) > completed (installed, logged)
```
* needs_review only if any item is pending; changes_requested branches back via franchisee resubmission. Item-level statuses: auto_approved, pending_review, approved, declined, changes_requested. `completed` is the only transition that writes the location record. Every transition writes an event, events power all timelines.

## 12. Signage.com outputs by stage

| Stage | Output | Consumed by |
|---|---|---|
| Pre-request | Configured brand program + budget one-pager per format | Franchisee + lender, corporate |
| Submission | Confirmation with next steps | Franchisee |
| Package prep | Clean request package (photos, specs, mockups, criteria review, TBD list) | Team, corporate |
| Corporate approval | Decision-ready approval email, then the approval record | Corporate |
| Landlord | Drawing submittal per criteria | Property manager |
| Permit (internal tail) | Full permit package incl. engineering — phase 2; MVP logs the milestones only | Municipality |
| Quote and money | Formal quote, invoice, paid receipt (or routed package email on the external tail) | Franchisee, lender, vendor |
| Fulfillment | The sign, installation, inspection pass, milestone updates | Franchisee, corporate |
| After install | Updated location record (specs, mockups, dates) | Everyone, forever |

Pattern: the same sign, rendered as different documents for five audiences. That is the product.

## 13. What is deliberately out of scope (MVP)

Modify/remove/rebrand intents (stubbed), franchisor self-serve onboarding, franchisee accounts, vendor portal, payment processing (the §10 lender documents are in scope — it is the money movement that is not), in-app messaging, automated compliance validation, CRM/ERP integrations, multi-language, decline-with-alternative, per-package quote acceptance, automated permit handling, permit workflow stages (phase 2), rebrand diff view (v2), the signed/stamped DID tier (pending the stamp decision).

## 14. Companion artifacts

- `docs/SPEC.md`, the build contract (data model, state machine, Design Studio integration requirements, build order)
- `docs/flow-demo.jsx` v12, the clickable three-persona reference
- Stakeholder workbook (stakeholder value, landlord requirements, franchisee journey and financing)
- CLAUDE.md + session prompts, the Claude Code handoff kit
