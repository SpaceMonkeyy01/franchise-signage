# Where the build is

Last updated: 17 Aug 2026, end of Session 3.

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
| Corporate reviewer | http://localhost:3000/dev | temporary stand-in, no login |

Sign in to `/admin` as `team@signage.com` — with no Supabase project configured
the login screen is a picker over `team_members`, which is a stand-in for a
login, not a login (see below).

| Command | What it does |
|---|---|
| `npm run dev` | dev database (port 5433) + Next (port 3000), together |
| `npm run dev:db` / `npm run dev:web` | either half on its own |
| `npm run dev:db:reset` | wipe `.pglite/` and re-seed from scratch |
| `npm run smoke` | drive the real flows in a browser — 59 checks (needs `npm run dev` up) |
| `npm test` | 58 unit tests — the §6 state machine and the seed pins |
| `npm run db:verify` | apply all migrations to a throwaway Postgres, 13 schema checks |
| `npm run seed` | seed a real target; set `DATABASE_URL` first |

**There is no Docker on this machine**, so `supabase start` cannot run. Instead
PGlite (Postgres compiled to WASM) runs as its own process speaking the real
Postgres wire protocol, and the app connects with `pg`. Point `DATABASE_URL` at
a Supabase connection string and the identical SQL runs there.

**The dev database serves one connection at a time.** The app's pool is capped
at one in dev and releases it after 500 ms idle, so a script can still connect
while `next dev` runs — but two clients at once get `ECONNRESET`. Anything that
talks SQL directly (the seed, the smoke test) should connect, work, disconnect,
and retry.

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

**Still temporary — `/dev`** is now only the **corporate reviewer** stand-in: the
queue of requests awaiting corporate, and per-item Approve / Request changes /
Decline with notes. It is the web version of the approval email Session 4 sends.
It has no login and refuses to exist in production unless `DEV_CONSOLE=1`.
**Delete the route when Session 4 lands — do not secure it.**

---

## Next: Session 4 — approval emails + the change-request loop by mail

Per `claude-code-sessions.md`: the reviewer email via Resend (auto-approved count
line, then each pending item with mockup, spec, vendor chip, price and a note
field), Approve / Request changes / Decline as **signed single-use expiring
links** (7 days) hitting minimal public pages, the re-review email on
resubmission, and the SLA timer (`review_sla_days` → the brand's `sla_action`).

The decisions themselves already exist and are tested — `decideLineItem` and
`requestChanges` in `src/lib/status/`. Session 4 is the delivery mechanism and
the link security around them, after which `/dev` is deleted.

---

## Owed, and worth clearing early

- **No behavioural RLS tests.** The policies are verified as valid SQL, never as
  behaviour: the dev database connects as the table owner, so RLS is present but
  never consulted. Token scoping rests on the WHERE clauses in
  `src/lib/db/queries.ts` and the ownership checks in each server action.
  **The first time a real Supabase project exists, test that anon cannot read
  another location's rows.** Still the largest untested assumption in the build.
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
4. **Worth answering before Session 5** (entry 20): a brand has exactly one
   `vendor_name`/`vendor_email`, but §4 resolves routing per item — so the
   Freshbites pylon's `approved_vendor` override has no address of its own and
   falls back to the brand's only vendor contact. Routing and the package split
   are right; the address is not. §3.1 needs per-policy vendor contacts before
   anything is actually emailed.
5. Session 3's calls (entries 23–26), chiefly the split between swappable
   identity and fixed authorization in `/admin`.

And unchanged from CLAUDE.md: the Design Studio integration path, the pilot
brand's real vendor policy, the stamp decision, the business model, the DID fee
amount, and the v13 flow demo (Session 8 stays blocked on it).
