# Where the build is

Last updated: 21 Aug 2026, Session 5. Session 5 is most of the way done; what
is left is listed under "Next" below.

## Session 5 so far

- `7590170` — per-policy vendor contacts (answers DECISIONS #20) and the vendor
  quote-package email.
- `fd0867d` — **the franchisee notification set** (SPEC §9 interface 5), proven
  rather than just written: seven templates under
  `src/lib/email/templates/franchisee/` (submitted, changes-requested,
  review-decided, quote-ready, quote-accepted, shipped, installed) plus the
  shared `shell.tsx` and the dispatcher `src/lib/email/franchisee.tsx`, wired at
  all seven call sites.
- **The §8b budget one-pager** — the first of the lender documents, and the
  foundation the other three sit on: `src/lib/pdf/letterhead.tsx` is the shared
  Signage.com document shell, and `budget-one-pager.tsx` is the per-format
  signage number a franchisor hands a candidate before any site exists.
  Downloadable from `/admin` (see DECISIONS #44 for why it is gated there and
  not public).
- **The §8b budgetary quote** — the second lender document, and the first one a
  franchisee holds themselves: `src/lib/pdf/budgetary-quote.tsx`, downloaded
  from the tokenized status page at `/api/documents/quote/{token}` once a quote
  is priced. Built from `est_price_snapshot`, so it agrees with the quote email
  and the status page by construction rather than by recomputation.
- **The split-request accept bug**, found by the budgetary quote and fixed:
  `acceptQuote` picked its package with `order by created_at desc limit 1`, but
  routing inserts every package in one transaction and Postgres `now()` is
  transaction-start time — so the rows share a `created_at` and the franchisee's
  click landed on a package chosen by an arbitrary tie-break. It now takes the
  quote id from the card that was clicked. DECISIONS #50–51.

105 smoke checks, 84 unit tests, 14 schema checks, typecheck and lint — all green.

**What the budgetary quote turned up.** The document covers a whole site, but
the status page had only ever shown `quotes[0]` — so a request routed two ways
(the seeded pylon override is exactly that case) showed the franchisee one
package's total while the PDF totalled both. The page now renders one card per
package, and the document names who is actually paid per section: Signage.com
issues the estimate, but an external package is invoiced to the franchisee by
the vendor directly, and a lender document that blurs that is wrong about the
one thing it exists to state. DECISIONS #46–49.

**What "proven" cost, and why it is worth knowing.** The set looked finished and
passed every check while sending almost nothing. Two reasons, both invisible
from the outside:

1. `add` and `replace` never captured a requester, so every request after the
   first had no `requester_email` — which `notifyFranchisee` correctly treats as
   "no recipient" and returns on. Fixed by carrying the contact forward from the
   location's most recent request (DECISIONS #41). The smoke suite now asserts
   the recipient **by address**, because "sent nothing" and "worked" were
   otherwise identical at every level.
2. The suite only ever drove the **external** tail. `deliverQuoteAction` and the
   `shipped` milestone were never called by anything, so `franchisee_quote_ready`
   and `franchisee_shipped` had no coverage at all. There is now a section that
   drives the **internal** tail end to end — a request holding only the Neon
   Leaf, the one add-on with no vendor override, routes to a single internal
   package — and asserts all seven notification kinds fire, that each is
   addressed to the requester, and that none of them carries a reviewer link.

Also fixed while there: a crashed smoke run used to poison the next one. The
opening cleanup was meant to cover that but could only name codes from its own
process, so an abandoned request that reached `completed` left Oak Plaza a sixth
installed sign and the next run failed on an assertion about a state the app had
produced correctly. The run now mirrors its codes to
`scripts/.smoke-leftovers.json` (gitignored) and clears the file only on a clean
finish.

## Next: the rest of Session 5

- The two remaining §8b lender PDFs, both on `letterhead.tsx` and both
  team-triggered from `/admin`: the **formal invoice** (on internal-tail
  acceptance) and the **paid receipt** (marked PAID with date and method).
  They are siblings — same trigger surface, near-identical shape — so they
  belong in one commit.
- The **§8d welcome email** — deliberately last. Its entire payload is "concept
  drawings and a signage number": the DID, which is Session 8 and still blocked
  on the v13 demo, and the budget one-pager, which now exists. Built any
  earlier it would have been an email whose main link had no destination. When
  it lands, the DID link is the one open forward reference in it.

---

Previous update: 17 Aug 2026, end of Session 4.

Read this first when picking the work back up. `docs/SPEC.md` is still the
contract and `claude-code-sessions.md` is still the plan — this file only says
what is done, what runs, and what is next.

---

## Running it

```bash
npm install          # once
npm run dev          # starts the dev database AND the web server
```

| Surface | URL | Who |
|---|---|---|
| Franchisee | http://localhost:3000/freshbites | no login; tokenized links |
| Signage.com team | http://localhost:3000/admin | allowlisted team email |
| Corporate reviewer | from a link in the approval email | no login, ever |
| Outbox (dev) | http://localhost:3000/dev | what would have been emailed |

Sign in to `/admin` as `team@signage.com` — with no Supabase project configured
the login screen is a picker over `team_members`, which is a stand-in for a
login, not a login (see below).

| Command | What it does |
|---|---|
| `npm run dev` | dev database (port 5433) + Next (port 3000), together |
| `npm run dev:db` / `npm run dev:web` | either half on its own |
| `npm run dev:db:reset` | wipe `.pglite/` and re-seed from scratch |
| `npm run smoke` | drive the real flows in a browser — 105 checks (needs `npm run dev` up) |
| `npm run sla` | run the review-SLA timer once (also at `/api/cron/review-sla`) |
| `npm test` | 84 unit tests — the §6 state machine, the seed pins, the §8b totals |
| `npm run db:verify` | apply all migrations to a throwaway Postgres, 14 schema checks |
| `npm run seed` | seed a real target; set `DATABASE_URL` first |

**There is no Docker on this machine**, so `supabase start` cannot run. Instead
PGlite (Postgres compiled to WASM) runs as its own process speaking the real
Postgres wire protocol, and the app connects with `pg`. Point `DATABASE_URL` at
a Supabase connection string and the identical SQL runs there.

**No mail is delivered.** With no `RESEND_API_KEY`, every message is rendered
and recorded in `sent_emails` instead of being sent, and `/dev` is how you read
it — including clicking the approval links a reviewer would click. Set the key
and the same code sends through Resend.

**The dev database serves one connection at a time.** The app's pool is capped
at one in dev and releases it after 500 ms idle, so a script can still connect
while `next dev` runs — but two clients at once get `ECONNRESET`. Anything that
talks SQL directly (the seed, the smoke test) should connect, work, disconnect,
and retry. If it starts refusing every connection, it has wedged — restart
`npm run dev:db`.

Uploaded files land in `.storage/` (gitignored) and are served from
`/api/files/…`. Setting `SUPABASE_STORAGE_BUCKET` makes the app refuse that path
on purpose — the Supabase driver is not written yet.

Also useful: the reference app at `reference/design-studio` (`npm run dev` inside
it, port 5173) serves `/demo` — the canonical v12 UX reference — and `/flow`.

---

## Done

**Session 0** — `docs/design-studio-findings.md`: what the retail Design Studio
can and cannot do, from its source, with eight flagged contradictions against
SPEC §8 and the question list for Usman. Plus `docs/FLOW.md` and `/flow`.

**Session 1** — Next.js 16 + TypeScript + Tailwind v4; the full SPEC §2–§5 schema
in five migrations including the §8b fields and §8c `did_requests`; the §10 RLS
policies; `src/lib/status/` as the single write path for request status; the seed
(taxonomy + Freshbites + Oak Plaza).

**Session 2 — the franchisee interface** (SPEC §9 interface 1), against the real
database: the co-branded home; the tokenized status page (per-item status,
prices, vendor chips, TBD and exception callouts, attached photos, quote card
with accept, production progress, timeline); the intent picker; the like-for-like
fast lane; add-signs; the four-step initial setup including the §8b financing
question and the lease sign exhibit; the change-request loop with real editing;
and real uploads behind `src/lib/storage/`.

**Session 3 — the team queue** (SPEC §9 interface 2) at **`/admin`**:

- Sign-in gated by the `team_members` allowlist, re-checked on every request.
- Queue bucketed by whose move it is (needs prep · with corporate · with
  franchisee · ready to route · in fulfillment · installed), with fast-lane
  badges and to-review / reopened / TBD rollups.
- Detail view with the whole action chain, showing only what is legal now:
  prepare package (with the §8b landlord criteria check), route for quote,
  manual pricing for standin items, per-item mockup upload, deliver quote,
  production → shipped → installed, and manual `landlord_approval` logging plus
  free-text notes.
- Both tails: internal drives production in-portal; external logs the vendor
  quote and the order placed with them, then the install.
- `Mark installed` performs the `installed_signs` writeback — replacements update
  the row they replace rather than duplicating it.

**Session 4 — the approval email and the reviewer's links** (SPEC §9 interface 3):

- The approval email, co-branded, leading with how many items are proceeding
  WITHOUT corporate and then one card per pending item — spec, origin, vendor,
  price, mockup, exception text, TBD note — with Approve / Request changes /
  Decline per item.
- Those buttons are signed links to `/review/{token}`: hashed in the database,
  expiring after 7 days, revoked the moment the package version changes, and
  retired once nothing is pending. Opening one decides nothing — mail scanners
  follow links, so the decision happens on the page.
- The re-review email on resubmission, which mints a new link and kills the old
  one.
- The SLA timer: `npm run sla`, `/api/cron/review-sla` (Bearer `CRON_SECRET`),
  and a daily Vercel cron. `remind` re-asks, `escalate` writes to the secondary
  reviewer or corporate, `auto_forward` records the brand's policy and tells the
  team to confirm — **nothing is ever approved by a clock**.
- `/dev` is now the outbox: every message the system sent or would have sent.
  The reviewer stand-in that lived there is deleted — the real links replaced it.
  The outbox itself stays useful once mail is live ("what exactly did we send
  them"), but it is still guarded and still unauthenticated: keep it only if it
  earns its place, and put it behind `/admin` if it does.

---

**Session 5 — the outbound mail** (SPEC §9 interface 5), partly done:

- Per-policy vendor contacts (`brand_vendor_contacts`), which answers DECISIONS
  #20 — the pylon's `approved_vendor` override now has an address of its own
  instead of falling back to the brand's only vendor.
- The vendor quote-package email: one per recipient, carrying no credential of
  either kind, corporate CC'd per policy.
- The seven franchisee notifications, driven end to end on both tails.

Still open in Session 5: the invoice and receipt PDFs and the §8d welcome email — see
"Next" at the top of this file.

---

## Owed, and worth clearing early

- **No behavioural RLS tests.** The policies are verified as valid SQL, never as
  behaviour: the dev database connects as the table owner, so RLS is present but
  never consulted. Token scoping rests on the WHERE clauses in
  `src/lib/db/queries.ts` and the ownership checks in each server action.
  **The first time a real Supabase project exists, test that anon cannot read
  another location's rows.** Still the largest untested assumption in the build.
- **No mail has ever actually been sent.** The Resend path in
  `src/lib/email/send.ts` is written and unexercised; everything so far has gone
  to the outbox. The templates, links, triggers and SLA around it are exercised
  by the smoke suite.
- **The Supabase Auth path has never run.** `/admin` authenticates through a dev
  cookie here; the magic-link send and session read in `src/lib/auth/team.ts` are
  written against an API nothing on this machine has called. The allowlist half —
  the part that actually decides access — is exercised by the smoke suite.
- **The seed has never run against Supabase**, only against the dev database.
- **The Supabase Storage driver is unwritten** — local disk only.
- **`src/lib/supabase/clients.ts` and `src/lib/env.ts` are still unused.**

## Decisions waiting on you

In `docs/DECISIONS.md`, none blocking:

1. Should SPEC §6 gain a terminal request-level `declined`, or is an
   all-declined request closed by hand? Today the derivation refuses to guess
   and returns `blocked: 'all_items_declined'`.
2. SPEC §5.4 should gain `changes_requested` as a fifth `line_item_status`.
3. Session 2's calls (entries 14–19): submission stopping at `submitted`, the
   structured address, optional sizing on add-ons, the note-on-timeline when no
   lease exhibit is provided, resolving the change request on resubmission, and
   storing uploads before the request exists.
4. ~~Entry 20 — per-policy vendor contacts.~~ **Answered and built** (entry 34):
   `brand_vendor_contacts`, one row per (brand, policy). Nothing already
   configured had to move. §3.1 should be amended to match.
5. Session 3's calls (entries 23–26), chiefly the split between swappable
   identity and fixed authorization in `/admin`.
6. Session 4's calls (entries 27–33), chiefly: **one link per email rather than
   per button** (a per-click link would break the other buttons in the same
   message), and **`auto_forward` never approving anything** — SPEC §3.1 offers
   it as a policy, and a timer that approves signage puts words in a
   franchisor's mouth.
7. Session 5's calls (entries 34–41), chiefly: **one `review_decided` email per
   review rather than the per-item pair SPEC §9 lists** — a reviewer decides a
   package in one sitting and a decline arrives buried if it is one of five
   messages; and **`in_production` sending nothing**, because the accept email
   already said production had started.

And unchanged from CLAUDE.md: the Design Studio integration path, the pilot
brand's real vendor policy, the stamp decision, the business model, the DID fee
amount, and the v13 flow demo (Session 8 stays blocked on it).
