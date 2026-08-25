# Standing up a Supabase project

Everything in this build runs without Supabase — `npm run dev` starts a
PGlite-backed Postgres and the app never knows the difference. But four things
have been written and never executed, and all four of them are waiting on one
project existing:

| Owed since | What it is | Cleared by step |
|---|---|---|
| Session 1 | The seed has never run against Supabase | 5 |
| Session 3 | The Supabase Auth path has never run | 7 |
| Session 5 | No mail has ever actually been sent | 8 |
| Session 6a | RLS is tested, but not through PostgREST and GoTrue | 6 |
| Session 6b | The Storage driver is written and unexercised | 4 |

About 30 minutes, most of it waiting for a project to provision. Nothing here is
irreversible — a Supabase project is free to throw away, and this runbook starts
from scratch every time.

---

## 1 · Create the project

Any region, any tier. Note the database password when it is shown; Supabase does
not show it twice, and step 3 needs it.

## 2 · Collect the keys

**Project Settings → API:**

- `NEXT_PUBLIC_SUPABASE_URL` — the project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon/public key. Safe in a browser: it
  is the key RLS is written against.
- `SUPABASE_SERVICE_ROLE_KEY` — **bypasses RLS entirely.** Server-only. If this
  ever reaches a browser bundle, every policy in `supabase/migrations/` is
  decoration.

**Project Settings → Database:** the connection string, as `DATABASE_URL`. Use
the direct connection rather than the transaction pooler — the migration runner
uses transactions and session-level settings that a transaction pooler drops.

Put them in `.env.local` (gitignored; `.env.example` is the template).

## 3 · Apply the schema

```bash
npm run migrate -- --dry-run     # what would run
npm run migrate                  # apply it
```

Eleven migrations, each in its own transaction, recorded in `schema_migrations`
as it goes. Postgres has transactional DDL, so one that fails half way leaves
nothing behind: fix the file and run again.

The migrations expect the `anon`, `authenticated` and `service_role` roles and
an `auth.jwt()` function to exist. **Supabase provides all four** — that is why
the local harnesses have to stub them and this does not.

> **Pointing it at a database that already has a schema** (the dev database, for
> instance) is refused rather than attempted, because there is no way to tell
> what still needs applying. `npm run migrate -- --baseline` records the history
> without running it, for a database you know is already up to date.

## 4 · Create the Storage bucket

**Storage → New bucket.** Name it whatever you set `SUPABASE_STORAGE_BUCKET` to
— `request-files` is the obvious choice.

**Make it PRIVATE.** A public bucket turns every stored path into a permanent
anonymous URL for a photograph of a franchisee's building and, in the same
table, for the lease exhibit beside it. The driver reads through the service
role and the app serves files from `/api/files/…`, which is the one place a rule
can be added later.

No bucket policies are needed: nothing reaches Storage except the server, using
the service role.

Then check it round-trips — upload a site photo through the franchisee flow and
open it from the status page. Two failures are worth causing on purpose, because
they look identical from the outside and only one of them is your mistake:

- **Wrong bucket name** → the upload fails loudly. It must never appear to
  succeed; the `request_files` row is written afterwards and would point at
  nothing.
- **Wrong service-role key** → reading throws rather than reporting a missing
  file. A broken bucket must not look like a franchisee who never uploaded
  anything.

Both are pinned in `src/lib/storage/__tests__/supabase-driver.test.ts`.

## 5 · Seed the pilot brand

```bash
npm run seed                          # taxonomy + Freshbites + locations
npm run seed -- --with-demo-requests  # add REQ-0016…19 from the demo
```

The seed has always been written to target a real database — this is the first
time it will have done so.

## 6 · Re-run the RLS assertions through PostgREST

`npm run db:verify` runs 20 behavioural checks (`scripts/rls-behaviour.ts`), but
it supplies the policies' inputs directly: no GoTrue mints the JWT and no
PostgREST forwards the `x-access-token` header. **The policies are the same; the
plumbing is not, and the plumbing is what has never run.**

The check that matters most, done by hand:

1. Take a franchisee's status-page URL and note its token.
2. Query PostgREST as anon, presenting that token as the header the policies
   read:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/requests?select=code,access_token" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "x-access-token: <that token>"
```

Expect **exactly one row** — theirs. Then repeat with no `x-access-token` header
at all and expect **an empty array**, not an error and not a list. If the second
call returns rows, stop: RLS is not being applied, and nothing else on this page
matters.

Repeat the same pair with a corporate dashboard token against `locations`, which
should return one brand's locations and never another's.

## 7 · Prove the Auth path

`/admin` authenticates through a dev cookie on a machine with no Supabase
project, and refuses to run that way in production (`authProvider()` throws).
With a project configured it takes the Supabase path instead — **which has never
executed.**

1. Add your address to `team_members` (`insert into team_members (email, name,
   active) values ('you@…', 'You', true);`).
2. Sign in at `/admin` and confirm the magic link arrives and the session reads
   back.
3. Set that row's `active` to false and reload. **You should be signed out
   immediately** — membership is re-checked on every request, which is the half
   of the design that actually decides access.

## 8 · Send one real email

Set `RESEND_API_KEY` and register a franchisee from the corporate dashboard. The
welcome email is the right one to send first: it is the first thing a franchisee
ever sees, and it is the only message with no request behind it, so nothing else
is disturbed if it goes wrong.

Everything sent is still recorded in `sent_emails` and readable at `/dev` —
that does not change when a provider is configured.

---

## What is different about Supabase, and what is not

**Not different:** the SQL. Every migration, query and policy in this repo runs
against PGlite and Supabase alike; that is why the app talks to Postgres through
`pg` rather than through supabase-js.

**Different, and worth knowing:**

- **Connection limits.** The dev database serves exactly one connection at a
  time and `src/lib/db/pool.ts` caps the pool at one to match. Against Supabase
  that cap is wrong in the other direction — raise it, and use the pooler
  connection string for the app (but not for `npm run migrate`).
- **RLS is actually consulted.** Locally the app connects as the table owner, so
  policies are inert and the WHERE clauses in `src/lib/db/queries.ts` are what
  scope every read. On Supabase both apply. A query that works locally and
  returns nothing there is a policy doing its job.
- **`auth.jwt()` is real.** The local stub returns whatever a test put in a GUC.
- **Storage is not a filesystem.** Paths are opaque keys, and `.storage/` has no
  equivalent to browse.
