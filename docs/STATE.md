# Where the build is

Last updated: 17 Aug 2026, end of Session 2.

Read this first when picking the work back up. `docs/SPEC.md` is still the
contract and `claude-code-sessions.md` is still the plan — this file only says
what is done, what runs, and what is next.

---

## Running it

```bash
npm install          # once
npm run dev          # starts the dev database AND the web server
```

Then open **http://localhost:3000/freshbites**.

| Command | What it does |
|---|---|
| `npm run dev` | dev database (port 5433) + Next (port 3000), together |
| `npm run dev:db` / `npm run dev:web` | either half on its own |
| `npm run dev:db:reset` | wipe `.pglite/` and re-seed from scratch |
| `npm run smoke` | drive the real flows in a browser — 41 checks (needs `npm run dev` up) |
| `npm test` | 54 unit tests — the §6 state machine and the seed pins |
| `npm run db:verify` | apply all migrations to a throwaway Postgres, 13 schema checks |
| `npm run seed` | seed a real target; set `DATABASE_URL` first |

**There is no Docker on this machine**, so `supabase start` cannot run. Instead
PGlite (Postgres compiled to WASM) runs as its own process speaking the real
Postgres wire protocol, and the app connects with `pg`. Point `DATABASE_URL` at
a Supabase connection string and the identical SQL runs there — the application
cannot tell the two apart.

**The dev database serves one connection at a time.** The app's pool is capped
at one in dev and releases it after 500 ms idle, so a script can still connect
while `next dev` runs — but two clients at once get `ECONNRESET`. Anything that
talks SQL directly (the seed, the smoke test) should connect, work, disconnect,
and retry.

Uploaded files land in `.storage/` (gitignored) and are served from
`/api/files/…`. Set `SUPABASE_STORAGE_BUCKET` and the app refuses to boot that
path on purpose — the Supabase driver is not written yet.

Also useful: the reference app at `reference/design-studio` (`npm run dev` inside
it, port 5173) serves `/demo` — the canonical v12 UX reference — and `/flow`, the
stakeholder walkthrough.

---

## Done

**Session 0** — `docs/design-studio-findings.md`: what the retail Design Studio
can and cannot do, from its source, with eight flagged contradictions against
SPEC §8 and the question list for Usman. Recommendation: iframe embed for the
interactive call sites, headless server-side calls for the rest. Plus
`docs/FLOW.md` and the `/flow` page.

**Session 1** — Next.js 16 + TypeScript + Tailwind v4; the full SPEC §2–§5
schema in five migrations including the §8b fields and §8c `did_requests`; the
§10 RLS policies; `src/lib/status/` as the single write path for request status;
the seed (taxonomy + Freshbites + Oak Plaza).

**Session 2** — the whole franchisee interface (SPEC §9 interface 1) works
against the real database:

- `/{brand}` home — installed-sign records and open requests per location.
- `/{brand}/request/{token}` status page — per-item status, prices, vendor chips,
  TBD and exception callouts, attached photos, quote card with accept, production
  progress, timeline.
- `/{brand}/location/{id}/request` — the intent picker; add and replace-like
  live, modify / remove / rebrand stubbed as the demo stubs them.
- `/{brand}/location/{id}/request/replace` — the like-for-like fast lane: pick an
  installed sign, say what happened, optional condition photo, submit. Spec and
  sizing come off the installed record; the item auto-approves.
- `/{brand}/location/{id}/request/add` — the catalog picker, with per-item sizing
  and the running estimate.
- `/{brand}/setup` — the four-step initial setup: basics + format + the §8b
  financing question + landlord contact and lease sign exhibit → the pre-loaded
  package checklist with photos, TBD and exception flagging → add-ons → review
  and submit.
- The change-request loop, on the status page: only the flagged items are
  editable, resubmitting bumps the package version, reopens exactly those items,
  and closes the change request.
- Real uploads behind `src/lib/storage/` — local disk in dev, one interface, with
  a type allowlist and a 10 MB cap.

Two shared pieces underneath all of it: `src/lib/db/create-request.ts` (the one
validated write path for a new request; every id is re-checked against the brand
because the flows have no login) and the seed's new **REQ-0019**, a request
sitting mid-change-request so the loop is reachable before the reviewer screens
exist.

---

## Next: Session 3 — the team queue

Per `claude-code-sessions.md`. In short: the Signage.com operator's side —
`/admin` behind Supabase Auth and the `team_members` allowlist, the request
queue, package prep (`prepPackage`, which is what moves everything the
franchisee has now submitted), manual pricing for standin items, mockup upload,
and vendor routing into `quotes`.

Everything the franchisee flows submit currently stops at `submitted` and waits
for exactly that screen.

---

## Owed, and worth clearing early

- **No behavioural RLS tests.** The policies are verified as valid SQL, never as
  behaviour: the dev database connects as the table owner, so RLS is present but
  never consulted. Token scoping is currently enforced by the WHERE clauses in
  `src/lib/db/queries.ts` and by the ownership checks in the server actions,
  which mirror the policies. **The first time a real Supabase project exists,
  test that anon actually cannot read another location's rows.** This is the
  single largest untested assumption in the build, and Session 2 added real
  write paths on top of it.
- **The seed has never run against Supabase**, only against the dev database.
- **The Supabase Storage driver is unwritten** — `src/lib/storage/index.ts` has
  the interface and the local driver; the Supabase one is a deliberate throw.
- **`src/lib/supabase/clients.ts` and `src/lib/env.ts` are still unused.**
  (`src/lib/status/supabase-store.ts` is gone — everything goes through `pg`.)

## Decisions waiting on you

In `docs/DECISIONS.md`, none blocking:

1. Should SPEC §6 gain a terminal request-level `declined`, or is an
   all-declined request closed by hand? Today the derivation refuses to guess
   and returns `blocked: 'all_items_declined'`.
2. SPEC §5.4 should gain `changes_requested` as a fifth `line_item_status` — the
   change-request loop cannot record which items reopened without it.
3. Session 2's calls, listed as entries 14–19: submission stopping at
   `submitted`, the structured address, optional sizing on add-ons, the
   note-on-timeline when no lease exhibit is provided, resolving the change
   request on resubmission, and storing uploads before the request exists.

And unchanged from CLAUDE.md: the Design Studio integration path, the pilot
brand's real vendor policy, the stamp decision, the business model, the DID fee
amount, and the v13 flow demo (Session 8 stays blocked on it).
