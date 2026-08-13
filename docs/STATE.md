# Where the build is

Last updated: 13 Aug 2026, end of Session 2 part 1 (commit `122f13c`).

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
| `npm run smoke` | drive the real flows in a browser (needs `npm run dev` up) |
| `npm test` | 54 unit tests — the §6 state machine and the seed pins |
| `npm run db:verify` | apply all migrations to a throwaway Postgres, 13 schema checks |
| `npm run seed` | seed a real target; set `DATABASE_URL` first |

**There is no Docker on this machine**, so `supabase start` cannot run. Instead
PGlite (Postgres compiled to WASM) runs as its own process speaking the real
Postgres wire protocol, and the app connects with `pg`. Point `DATABASE_URL` at
a Supabase connection string and the identical SQL runs there — the application
cannot tell the two apart.

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

**Session 2, part 1** — the app actually runs. `/{brand_slug}` home with
installed-sign records and open requests; `/{brand_slug}/request/{token}` status
page with per-item status, prices, vendor chips, TBD and exception callouts,
quote card, production progress and timeline; a working accept-quote that runs
through the state machine.

---

## Next: finish Session 2

In the order the demo walks them:

1. **Intent picker** — `/{brand_slug}/location/{id}/request`. Add and
   replace-like live; modify / remove / rebrand stubbed exactly as the demo
   stubs them. Show the approval path up front.
2. **Like-for-like fast lane** — installed-sign picker with thumbnails → reason
   (damaged / worn / vandalized) → optional condition photo → pre-approved
   confirmation with the price → submit. Specs come from the installed record.
   The state machine already does this; it needs the screens.
3. **Initial setup** — `/{brand_slug}/setup`: basics and format (including the
   §8b financing question, optional landlord contact, and the TBD-able lease
   sign-exhibit upload as a `landlord_criteria` file) → the pre-loaded package
   checklist with per-item config, TBD toggles and exception flagging → add-ons
   with prices and vendor chips → review with estimate totals and the
   vendor-policy note → submit.
4. **Resubmission** — the change-request loop with real field editing, not the
   demo's simulated button. `applyResubmission` in `src/lib/status/machine.ts`
   already handles the state; the status page needs editable flagged items.
5. **Uploads** — real photo uploads. No Storage bucket exists yet; on the dev
   database this needs a local filesystem adapter behind the same interface.

Then Session 3 (team queue), per `claude-code-sessions.md`.

---

## Owed, and worth clearing early

- **No behavioural RLS tests.** The policies are verified as valid SQL, never as
  behaviour: the dev database connects as the table owner, so RLS is present but
  never consulted. Token scoping is currently enforced by the WHERE clauses in
  `src/lib/db/queries.ts`, which mirror the policies. **The first time a real
  Supabase project exists, test that anon actually cannot read another
  location's rows.** This is the single largest untested assumption in the build.
- **The seed has never run against Supabase**, only against the dev database.
- **`src/lib/status/supabase-store.ts` is now redundant** — everything went to
  `pg`. Delete it, or keep it only if supabase-js is genuinely wanted later.
- **`src/lib/supabase/clients.ts` and `src/lib/env.ts` are unused** so far.

## Decisions waiting on you

Both written up in `docs/DECISIONS.md`, neither blocking:

1. Should SPEC §6 gain a terminal request-level `declined`, or is an
   all-declined request closed by hand? Today the derivation refuses to guess
   and returns `blocked: 'all_items_declined'`.
2. SPEC §5.4 should gain `changes_requested` as a fifth `line_item_status` — the
   change-request loop cannot record which items reopened without it.

And unchanged from CLAUDE.md: the Design Studio integration path, the pilot
brand's real vendor policy, the stamp decision, the business model, the DID fee
amount, and the v13 flow demo (Session 8 stays blocked on it).
