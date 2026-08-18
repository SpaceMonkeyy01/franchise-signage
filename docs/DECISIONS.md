# Build decisions and divergences

Where the implementation departs from `docs/SPEC.md`, or where the spec was
silent and a call had to be made. One section per session. SPEC.md remains the
contract — entries here are proposed amendments to it, not replacements.

---

## Session 1 — scaffold, schema, seed

### Divergences from SPEC.md that need a spec amendment

1. **`line_item_status` has a fifth value, `changes_requested`.**
   §5.4 lists four. But §6 and §7 define a change-request loop in which flagged
   items reopen for the franchisee, and the demo's `ITEM_STATUS` map carries
   `changes_requested` so the status page can render a per-item callout. Without
   the value there is nowhere to record which items reopened. Added to the enum;
   §5.4 should gain it.

2. **`line_items.est_price_snapshot` (new column).**
   §5.4 does not carry a price on the line item, and the demo reads prices live
   off the brand item. That works in a demo and fails in production: catalog
   prices move, and §8b requires that the number a franchisee saw, a reviewer
   approved, and a lender document quotes are the same number months later. The
   snapshot is taken at submission. Null mirrors a standin item's "Custom quote".

3. **`brands.corporate_email` (new column).**
   §3.1 has `corporate_cc boolean` but no address to CC. The demo's vendor
   presets carry `corporateEmail`. Added, with a check constraint: you cannot
   set `corporate_cc` without one.

4. **`locations.code` / `requests.code` (new columns).**
   The demo shows `LOC-0007` and `REQ-0018` on every screen and both personas
   say request numbers out loud. Sequence-backed; the uuid stays the key.

5. **`quotes.line_item_ids` (new column).**
   §4 requires that one request can split into several packages to different
   recipients. §5.6 gives quotes a `priced_count` but no way to say *which*
   items are in the package. Without it the split is unimplementable.

6. **`franchisee_registrations` (new table).**
   §8d level 1 — corporate registers a franchisee's brand email at agreement
   signing, which fires the welcome email and opens DID access. §8d specifies
   the behaviour but no object to hold it. This is the only franchisee identity
   that exists before a lease.

7. **`brands.did_allowed_email_domains` and `brands.did_fee_cents`.**
   §8c requires brand-domain validation and a configurable fee. CLAUDE.md is
   explicit that the fee must be config, not a constant. Per-brand column, with
   the platform default in `DID_FEE_CENTS`.

### Judgment calls where the spec is silent

8. **`approval_mode` is the outer switch, not a peer of the origin rules.**
   §7 describes the four origin rules and the three approval modes separately
   and never says which wins. Implemented as: `never` → everything
   auto-approves; `always` → everything is reviewed, including the fast lane;
   `standard_model` → the four bullets. The alternative reading (origin rules
   always win, so an exception is reviewed even under `never`) is defensible;
   this one is simply more predictable to explain to a franchisor. **The pilot
   brand uses `standard_model`, where the question does not arise.**

9. **An all-declined request has no status to derive to.**
   §6 has no request-level `declined`. If a reviewer declines every item there
   is nothing to quote and nothing to install. Rather than invent a status or
   silently park the request in `approved` with an empty package, the derivation
   returns `blocked: 'all_items_declined'` and package prep refuses, leaving the
   team to close it by hand. **Open question for the spec: should §6 gain a
   terminal `declined`, or is manual closure correct?**

10. **`master_catalog` is keyed on `(placement, sign_type, variant)`, not
    `source_id`.** The live Signize taxonomy reuses `source_id` across branches
    (`docs/TAXONOMY-NOTES.md`), so it cannot identify a row. `source_id` is kept
    as a non-unique re-sync hint.

11. **`request_events.kind` is unconstrained `text`.**
    The session brief requires the phase-2 permit stages to be loggable without
    a schema change. Any CHECK constraint or enum would break that promise, so
    the vocabulary lives in `src/lib/status/events.ts` and is validated in the
    application. Verified by a schema check.

12. **The franchisee token travels as an `x-access-token` header.**
    §10 says "RLS: anon role scoped by presented token" without saying how the
    token reaches the policy. PostgREST exposes request headers to
    `current_setting('request.headers')`, so the anon client carries the token
    as a header and `app.access_token()` reads it. A session GUC fallback exists
    for server-side callers and tests.

13. **`brands` is closed to anon; `brands_public` is the view franchisees read.**
    The co-branded entry page needs brand name, logo and colours. The row also
    holds `reviewer_email`, `corporate_email` and `vendor_email`, and RLS filters
    rows, not columns. The view exposes the co-branding fields only.

### Not done, and why

- **Migrations have not been applied to a real Supabase instance.** Docker is
  not installed on this machine, so `supabase start` cannot run. Instead
  `npm run db:verify` applies all five migrations to an in-process Postgres
  (PGlite) and asserts the resulting shape, including a smoke test that walks
  the demo's REQ-0017 fast-lane storyline end to end in SQL. What that does
  **not** cover: GoTrue, Storage, and how PostgREST actually populates
  `request.headers` — so the RLS policies are verified as valid SQL, not as
  behaviour. **Behavioural RLS tests are owed once Docker or a hosted project is
  available, before Session 2 ships.**
- **`scripts/seed.ts` has not been executed** for the same reason. Its inputs
  are covered by unit tests: every brand-item pin is resolved against the real
  taxonomy, and prices are asserted to exist exactly on the items whose pinned
  master row is `direct`-priced.
- **No Storage buckets yet.** Session 2 owns uploads and creates them.

### Corrected after Session 1 was committed

- **`line_items.replaces_sign_id` is `ON DELETE RESTRICT`, not `SET NULL`.**
  Found by running the seed twice. Deleting an installed sign fired the SET NULL
  cascade, which produced an UPDATE that violated
  `line_items_replacement_fields` — the constraint requiring a replacement to
  name its target. The behaviour was wrong either way: an installed sign a live
  request points at is history and must not be deletable. Retiring one is a
  status change to `removed`. The migration was edited in place rather than
  patched by a follow-up, because the schema has never been applied to any real
  database. Covered by a schema check.
- **The seed no longer rebuilds `installed_signs` wholesale.** It inserts only
  signs that are not already on the location, for the same reason.

### Open items this session did not touch

Unchanged from CLAUDE.md: the Design Studio integration path, the pilot brand's
real vendor policy, the stamp decision, the business model, the DID fee amount,
and the v13 flow demo. Session 0's `docs/design-studio-findings.md` question
list for Usman is still unanswered.

---

## Session 2 — the franchisee flows

### Judgment calls where the spec and the demo are silent

14. **Submission leaves a request at `submitted`, never at its derived status.**
    Deriving forward — the fast lane collapsing to `approved`, or the split into
    `needs_review` — is package prep, which SPEC §6 gives to the team. So the
    three submitting screens all stop at `submitted` and Session 3's queue moves
    them. Matches the demo, whose submitted requests all sit at "Submitted" until
    a "Package prepared" event appears.

15. **The setup form collects a structured address; the demo collects one line.**
    `locations.address` is jsonb with `{line1, city, state, zip}` and the brand
    home already renders the parts separately. The §8b lender documents and §8c
    DID both need a real ZIP, so the fields are split rather than parsed back out
    of a free-text line later.

16. **Add-ons and package items now collect optional sizing.** The demo's
    add-a-sign screen collects nothing but the item, yet its seeded REQ-0018
    carries `48" back wall`. Collecting it (with the same TBD toggle as setup)
    is what the seed data implies, and the alternative is that the team chases
    every add-on by email.

17. **A `landlord_criteria` file that is not provided writes a `note_added`
    event.** §8b makes the lease sign exhibit TBD-able and never blocking, but
    "not provided" then leaves no trace at all. A franchisee note on the timeline
    is the lightest way to give the team something to chase without inventing a
    column or a status.

18. **A `changes_requested` request resolves its change request on
    resubmission.** `change_requests.resolved_at` existed with nothing to set it,
    so the franchisee's status page would still say "corporate asked for changes"
    after they had made them. Closing it belongs to `resubmitRequest()`, next to
    the item statuses it reopens, so the loop closes in one place.

19. **Uploads are stored before the request exists.** All three flows collect
    photos while the form is still being filled, so the file goes to storage on
    pick and the `request_files` row is written at submission. An abandoned form
    therefore leaves an orphaned object and no row — cheaper than writing draft
    rows for requests that may never be submitted, and invisible to every query.

### Corrected while building

- **The dev database serves one connection at a time.** PGlite behind the socket
  bridge resets a second connection mid-query, which surfaced as `ECONNRESET`
  the first time a page ran two queries in a `Promise.all`. The pool is capped at
  one connection in dev, with a 500 ms idle timeout so the seed, the smoke test
  and `psql` can still reach the database while `next dev` is running. Against
  Supabase both settings are the normal ones.
- **`seedDemoRequests` was not actually idempotent.** Its "replace the demo
  request wholesale" delete cascades into `request_events`, which the append-only
  trigger refuses — so a re-seed of an already-seeded database failed. The
  trigger now comes off for exactly that statement.
- **The request code sequence had to be moved past the demo codes.** REQ-0016…19
  are hardcoded demo state while real requests draw from `request_code_seq`,
  which starts at 1 — so the 16th real request in a seeded database would have
  collided on `requests.code`.

### The temporary operator console (`/dev`)

Built after Session 2 because the franchisee flows submit real requests that
nothing could move: package prep belongs to the team (Session 3) and approvals to
corporate (Session 4), so the storyline dead-ended at `submitted`. It is
throwaway UI over permanent rules.

20. **A brand has one vendor identity, and a per-item override has nowhere to
    point.** §3.1 gives `brands` a single `vendor_name`/`vendor_email`, while §4
    resolves routing per item as `brand_items.vendor_policy_override ??
    brands.vendor_policy`. The Freshbites pylon — the seeded row that exists to
    prove one request can split across two recipients — overrides to
    `approved_vendor` while the brand's own policy is `signage_com`, so the
    override resolves to a policy the brand has no contact for. Two consequences,
    handled differently:
    - **Display**: `VendorChip` now takes the brand's own policy and refuses to
      print the brand's vendor name against a policy that is not it. Telling a
      franchisee their pylon is going to "Signage.com Manufacturing" when it is
      being routed elsewhere is worse than saying "External vendor".
    - **Routing**: falls back to the brand's single vendor contact, which is the
      only address on file. **§3.1 needs per-policy vendor contacts (or a contact
      on `brand_items`) before Session 5 mails anything for real.** Related to
      the open question of the pilot brand's actual vendor policy.

21. **`decideLineItem` lives in `src/lib/status/`, not in the console.** The
    console is temporary; "approve or decline one item, and move the request only
    when nothing is left pending" is the §7 rule and belongs with the other
    rules. Session 4's signed email links call the same function. Same reasoning
    for `src/lib/db/routing.ts`, which is the routing half of Session 5 without
    the email.

22. **`/dev` has no authentication at all.** It performs every privileged action
    in the system. It is refused outside development unless `DEV_CONSOLE=1` is
    set deliberately (`src/app/dev/guard.ts`). Sessions 3 and 4 replace it with
    Supabase Auth + the `team_members` allowlist, and with signed single-use
    reviewer links; this must be deleted then, not secured.

---

## Session 3 — the team queue

23. **Team identity is swappable; team authorization is not.**
    §10 specifies Supabase Auth with an email allowlist, and there is no Supabase
    project on this machine to authenticate against. So `src/lib/auth/team.ts`
    splits the two halves: *identity* ("which email is this?") comes from
    Supabase Auth when a project is configured and from a dev cookie when one is
    not, while *authorization* ("is that email on the team?") is the same
    `team_members` lookup either way, re-checked on every request so
    deactivating a row signs someone out immediately. The dev provider refuses to
    run in production, where a missing Supabase config is a hard error rather
    than a fallback. **The Supabase path has never executed** — the magic-link
    send and the session read are written but unverified.

24. **`/admin` shows only the actions that are legal right now.** The §6 machine
    would reject the rest, so rendering them would be offering an operator a
    button that cannot work. The queue's "next step" column and the detail
    panel's action set are both derived from the request's own status, which is
    also why the queue is bucketed by whose move it is rather than by raw status.

25. **The external tail logs three things the portal does not control**:
    `log vendor quote` (a number came back), `log order placed` (the franchisee
    ordered with the vendor directly) and `mark installed`. Written as logging
    rather than as driving, because on this tail the portal's job is to stay an
    accurate record — it is not in the loop and should not imply that it is.

26. **`fileUrl` moved to `src/lib/storage/url.ts`.** Client components need to
    link to a stored file; `src/lib/storage/index.ts` reaches for `node:fs`, and
    importing it from a client component fails the Turbopack build outright. The
    pure string function is now its own import-free module, re-exported from the
    index so server callers are unaffected.

---

## Session 4 — approval emails and the reviewer's links

27. **One link per email, not one per button.** "Signed single-use expiring
    links" (SPEC §9 interface 3) reads naturally as a link per action, but an
    approval email carries three buttons per item and a reviewer decides several
    — so a link burned by the first click would break every other button in the
    same message. Instead the token identifies the EMAIL: it stays valid until
    nothing on the request is pending (`used_at`), and is revoked the moment the
    package version changes. The per-item buttons carry `?item=&action=` so the
    right card opens with the right action selected.

28. **Links open a page; they never act on GET.** Corporate mail filters follow
    every link in a message, so a URL that approved a sign would be approved by
    a spam scanner. The link renders the item and the decision happens on POST,
    which is also why the review page shows the whole request rather than a bare
    confirmation.

29. **The token is stored hashed.** `review_links.token_hash`, never the token.
    It is the reviewer's entire credential — a dump of that table would otherwise
    be a set of working approvals.

30. **`sla_action = auto_forward` does not approve anything.** SPEC §3.1 offers
    it as a brand policy, and the obvious reading — proceed without corporate —
    would mean a timer putting words in a franchisor's mouth. It logs that the
    brand's policy is to proceed and tells the team to confirm; no item is ever
    decided by a clock. `remind` re-sends the ask (minting a fresh link, since
    the original may be near expiry) and `escalate` writes to the secondary
    reviewer or corporate with a short notice that carries no decision buttons.

31. **The SLA clock starts at the ask, not at submission.** It measures from the
    most recent `review_email_sent` event, so a request that waited three days
    for package prep has not spent the reviewer's week. A lapse is acted on once
    per package version, which makes the runner safe to schedule hourly.

32. **Mail has an outbox, and it is not only for development.** Every message is
    written to `sent_emails` before the provider is called and updated after.
    With no `RESEND_API_KEY` the send is skipped and the row is all there is,
    which is what `/dev` now reads. With a key, the same rows answer "what
    exactly did we send them" long after the provider's retention window.

33. **Templates render through a dynamic import of `react-dom/server`.** Next
    refuses a static import of it anywhere in a Server Component's graph, and
    these templates are reached from Server Actions. Importing it inside
    `render()` keeps the JSX templates CLAUDE.md asks for.

## Session 5 — routing emails, notifications, lender documents

34. **Entry 20 is answered: vendor contacts are per policy, in their own table.**
    `brands` carries exactly one `vendor_name`/`vendor_email`, but §4 resolves
    routing per ITEM — so the Freshbites pylon's `approved_vendor` override had
    no address of its own and fell back to the brand's only vendor. Cosmetic
    while nothing was mailed; this session mails it. `brand_vendor_contacts` is
    one row per (brand, policy), resolved in this order: the contact row → the
    brand columns when the policy IS the brand's own → corporate for
    `corporate_first` → the platform address for `signage_com`. Nothing already
    configured has to move, because a brand's own policy still resolves through
    the columns it always did.

35. **An unresolvable recipient throws instead of falling back.** The old code
    silently used the brand's single vendor address for any external policy. The
    failure mode of guessing is mailing one vendor's package — mockups, specs,
    prices, the site address — to a different company, so routing now refuses and
    names the missing contact. A brand misconfigured this way cannot route at
    all, which is the correct amount of broken.

36. **The vendor package is the one email that carries no credential.** Every
    other template goes to someone inside the program. This one leaves it, and it
    gets forwarded — corporate forwards `corporate_first` packages by design. So
    it contains no access token and no `/review/` link, only `/api/files/…` URLs
    for the mockups and site documents it is useless without, and the smoke suite
    asserts both absences on every routed package.

37. **The package is sent as Signage.com, not as the brand.** SPEC §8d makes the
    brand the voice for franchisee- and franchisor-facing mail. A vendor is being
    contracted by Signage.com, and a request for quote should come from whoever
    will be paying the invoice. Corporate is still CC'd per `corporate_cc`,
    except on `corporate_first`, where the package is already addressed to them.

38. **One timeline line per routing, not one per package.** `quote_sent` already
    names every recipient and total, worded as `docs/flow-demo.jsx:180` words it.
    A second event per package would only repeat it, so the mail record lives in
    `sent_emails` — and an event is written only when a package FAILS to send,
    which is the one thing the timeline would not otherwise show.

### Corrected while building Session 4

- **The dev database wedges if a script exits the instant it closes its pool.**
  `npm run sla` called `process.exit(0)` immediately after `closePool()`, cutting
  the socket teardown short; every subsequent connection to the PGlite bridge was
  then reset until the server was restarted. The script now lets Node exit on its
  own. The pool also attaches `error` handlers at both pool and client level —
  an unhandled one killed the process mid-retry.

### Not done, and why (Sessions 2–4)

- **Still no behavioural RLS tests, and still no Supabase project.** Unchanged
  from Session 1, and now the largest untested assumption in a build that has
  real franchisee write paths, a team console, and an auth path written against
  an API nothing here has called.
- **The Supabase Storage driver is not written.** `src/lib/storage/` has the
  interface and a local-disk driver; setting `SUPABASE_STORAGE_BUCKET` throws a
  deliberate error rather than silently writing files to a container's disk.
- **No mockups from Design Studio.** `mockup_file_id` is written when the team
  uploads one by hand (Session 3) or a file of kind `mockup` is attached, but
  nothing generates one — the generic `render_key` thumbnail is what every screen
  falls back to, as CLAUDE.md requires.
- **No emails.** Session 3's queue moves requests; nobody is told. Every
  notification, including the approval email whose stand-in is `/dev`, is
  Sessions 4–5.
