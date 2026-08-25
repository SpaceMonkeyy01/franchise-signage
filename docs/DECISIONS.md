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

39. **One `review_decided` email per review, not one per item.** SPEC §9 lists
    "item approved" and "item declined" as separate notifications. A reviewer
    decides a whole package in one sitting, so per-item mail means five messages
    in five minutes saying nearly the same thing, and the one that matters — a
    decline — arrives buried among them. The email is sent once, when
    `retireLinkIfReviewComplete` reports nothing left pending, and it carries
    every decision at once: approvals with their prices, declines with their
    reasons, and the count that never needed corporate at all. Per-item
    notification is still the right shape for `changes_requested`, which is a
    request for the franchisee to act, not a summary.

40. **`in_production` sends nothing.** It is the only transition in the internal
    tail with no franchisee email. They were already told production had started
    in the moment they accepted the quote — the accept email says so and gives
    the turnaround — so a second message hours later carries no new fact. The
    smoke suite asserts the silence rather than leaving it to be read as a
    missing template. Every other milestone on the tail does mail: `shipped` and
    `installed` are both facts the franchisee could not otherwise know.

41. **`add` and `replace` carry the requester forward from the location.**
    Neither flow asks who the franchisee is — the question was answered at
    initial setup, and putting a contact form between a franchisee and a
    two-click like-for-like replacement is the friction the fast lane exists to
    remove. So `createAndSubmitRequest` copies the contact from the most recent
    request on the same location that has one. Until this landed, every request
    after the first had a null `requester_email`, which `notifyFranchisee`
    treats as a legitimate "no recipient" and returns on — so the whole
    notification set silently did nothing from the second request onward while
    every flow still passed. The smoke suite now asserts the recipient by
    address, not just that mail was sent, because "sent nothing" was
    indistinguishable from "worked" at every other level.

42. **`@react-pdf/renderer` for the §8b document set.** Four documents need a PDF
    engine and the project had none. The alternative was HTML→PDF through
    headless Chromium, which is already a devDependency for the smoke suite —
    but making Playwright a *production* dependency to print four invoices means
    shipping a browser to Vercel, and the documents are static letterhead with a
    table. React-pdf keeps them as components next to the email templates they
    are a sibling of, and renders in-process.

43. **The §8b documents lead with Signage.com, not the brand — the inverse of
    the emails.** SPEC §8d makes the brand the voice for franchisee-facing mail,
    and the email chrome follows it. These four are read by a lender deciding
    whether to disburse, and Signage.com is the payee on all of them. A document
    that leads with the franchisor's logo invites exactly the wrong question
    about which company the money goes to. `DocumentShell` also takes payee,
    amount, date and purpose as required props rather than optional ones,
    because SPEC §8b's "lenders require payee/amount/date/purpose to be evident"
    is an acceptance criterion, not a styling note.

44. **The budget one-pager is team-gated, not public.** SPEC §8b offers "a public
    brand-page download if trivial", and the sheet holds nothing about any
    franchisee — but it does hold a brand's entire standard-package price list,
    and publishing a franchisor's pricing is their decision, not a default we
    pick for them. The spec's real trigger is corporate, whose dashboard is
    Session 6; until then the team exports on their behalf and opening the route
    up is one line.

45. **The total never absorbs a custom-quote item.** Standin-priced items — the
    pylon above all — cannot be estimated before a site is known, so they are
    counted as lines and named beneath the total rather than folded into it. A
    total that quietly included a guess for a monument sign is precisely the
    number a lender would rely on and nobody has quoted. Pinned in
    `src/lib/pdf/__tests__/`, because both ways this can be wrong produce a
    document that looks completely reasonable.

46. **The budgetary quote is the whole request, not one quote package.** SPEC §4
    can split one request between Signage.com and the brand's approved vendor,
    so `quotes` is a list and the status page was showing `quotes[0]`. A lender
    is funding a site, not a package: the PDF totals every package and the
    status page now renders one card per package, because a franchisee reading
    $12,900 on screen and forwarding a PDF that says $19,500 is the worst
    version of this feature. Each section names who is actually paid — the
    letterhead says Signage.com because Signage.com issues the estimate, but on
    an external package the vendor invoices the franchisee directly, and a
    lender document that implies otherwise is wrong about the one thing it
    exists to state.

47. **The budgetary quote is token-gated, the exact inverse of the one-pager
    (#44).** The token is the credential the status page already runs on, and
    §8b puts this document in the franchisee's hands specifically because they
    are the one filling in a loan application. It is offered whether or not they
    ticked the financing box — that answer was captured at submission and
    lenders turn up later, so the flag changes the wording, never the
    availability.

48. **A quoted-but-unpriced request is refused, not rendered.** Routing creates
    the quote row before anything is priced, so the document would total $0 —
    which reads as a real number on a lender's desk. Same refusal as the
    one-pager's empty package. Items still with corporate, and items declined,
    are disclosed as counts beneath the total rather than silently omitted, so
    the figure cannot read as final when it is not.

49. **Still open: the document names no borrower.** `FOR` is the location, not a
    person or entity. `requests.requester_name` is whoever filled the form,
    which is not necessarily the borrowing entity, and naming a borrower we
    inferred on a loan document is the same class of error as inventing
    `PAYEE.address`. If lenders come back asking for it, it should be captured
    deliberately rather than derived. Same reasoning for a validity window:
    "valid 30 days" is a commitment Signage.com has not made, so the document
    states its issue date and says pricing is current as of it.

50. **Accepting a quote names the package; it no longer guesses.**
    `acceptQuote(token)` read the package back as `order by created_at desc
    limit 1`. That is wrong twice over on a SPEC §4 split request: routing
    inserts every package inside one transaction, and Postgres `now()` is
    transaction-start time, so the rows carry an **identical** `created_at` and
    the "latest" is an arbitrary tie-break — the franchisee's own click landed
    on a package chosen at random. It now takes the quote id from the card that
    was clicked, scoped by request id so a token still authorizes only its own
    request (SPEC §10), and refuses a package already accepted.

51. **A request split across two recipients runs the external tail, and the
    franchisee is not asked to accept.** The team console already derived it
    this way — `quotes.some(external)` — while the status page offered an Accept
    button on the Signage.com package. The two surfaces now agree, and the
    franchisee is told who they order with instead. **This needs a spec answer:**
    SPEC §6 presents the two tails as alternatives and is silent on a request
    that is both, and there is only one request-level status, so accepting the
    internal half would move the whole request to `accepted` and strand the
    external half's "log order placed" (which is gated on `quote_ready`). A
    two-dimensional state is a real design change, not a bug fix, so it was not
    invented here. The cost of the current answer: Signage.com fabricates its
    half of a split request without a recorded franchisee acceptance.

52. **The invoice and receipt cover one PACKAGE; the budgetary quote covers the
    REQUEST.** An estimate covers a site because a lender funds a site. An
    invoice covers what Signage.com is owed, and on a split request the vendor
    invoices their own package directly — so the database refuses an invoice
    number on an external quote (`quotes_only_internal_is_invoiced`). Billing
    the pylon on Signage.com letterhead would charge the franchisee twice for
    one sign, and the check is in the schema rather than only in the action
    because it is the kind of mistake that survives a UI rewrite.

53. **One component renders both documents.** They differ in the type, the
    purpose, the total's label and a PAID block; a receipt is an invoice that
    has been paid. Rendering them from one body is what guarantees the receipt
    states the same number as the invoice it acknowledges — the only fact a
    lender cross-checks between the two — instead of leaving them to agree by
    coincidence.

54. **Issuing is team-triggered; downloading is the franchisee's.** SPEC §8b
    says both documents are team-triggered and they are — nothing exists until
    the team issues the invoice and records the payment. But the person who
    hands an invoice to a lender is the franchisee, so once issued both appear
    on their tokenized status page beside the budgetary quote. Making them ask
    the team to email a PDF that already exists is the friction §8b was written
    to remove.

55. **The invoice number is assigned once, from a sequence, and never
    regenerated.** A lender files a document by its number, so a number derived
    at render time would make every download a different document. Issuing
    twice is refused, and the schema requires the number and its date to be set
    together — a half-issued invoice is a document with a gap in it.

56. **No payment is processed, and the receipt says so by saying nothing.**
    SPEC §11 keeps processing out of MVP; the team records what the bank
    statement already says (`paid_at`, free-text `payment_method`,
    optional `payment_reference`) and the receipt renders it. Free text because
    "check 4417" and "ACH" are both what someone will type, and an enum would
    only be wrong for the method nobody anticipated.

57. **Consequence of #51 worth stating plainly: a split request cannot be
    invoiced at all.** The invoice trigger is acceptance, and the franchisee is
    no longer offered acceptance on a request that also has an external
    package — so Signage.com's half of a split request has no `accepted_at` and
    therefore no invoice. That is not a separate bug; it is the same unresolved
    question (#51) reaching the next document. Whatever answers #51 answers
    this. Until then, a split request's Signage.com half is billed outside the
    portal.

58. **The welcome email's link is a registration token, not the §8c magic
    link — a spec divergence worth naming.** SPEC §8d says the welcome email
    carries "the brand-email magic link". That link is §8c's, it authorizes DID
    generation, and it is Session 8. The half of the §8d payload that exists
    today is the budget number, so `franchisee_registrations` gained an
    `access_token` on the same convention as `requests.access_token` — opaque,
    in the URL, the credential itself — and the email opens a level-1 landing
    page at `/{brand_slug}/welcome/{token}`. The token is not a substitute for
    the magic link: when §8c lands, the DID button on that page is what the
    magic link protects, and this token still addresses the page. §8d should be
    amended to separate "how they reach their page" from "what authorizes a
    DID", which v2.1 collapses into one sentence.

59. **The DID is described in words, with no button.** It is the other half of
    what §8d promises and it has no destination until Session 8. A dead link in
    the first message a franchisee ever receives is the worst 404 in the build,
    and a disabled control is not better — it teaches someone that part of the
    product is decoration. Both the email and the landing page say what happens
    at LOI and tell them to speak to their brand contact. A unit test asserts
    the email's only href is their own page.

60. **Registration IS the send.** There is no "now send the welcome" step:
    saving the row emails them. A registration nobody was told about is not
    access, and a second button is a second thing to forget. The consequence is
    that a repeat registration must not be an error — the realistic case is
    corporate re-registering because the franchisee says nothing arrived — so
    `(brand_id, email)` conflicts keep the existing row, keep the existing
    token, and send again. Minting a new token would kill the link in the first
    email, which is the opposite of what was asked for.

61. **The team registers, and the row says so.** §8d's actor is corporate at
    agreement signing, and their dashboard is Session 6 — so this sits on
    `/admin` beside the §8b budget export, for the reason given in #44.
    `registered_by` is passed as `'team'` rather than left on the column's
    `'corporate'` default: the record should say who actually typed it, and
    Session 6 passes `'corporate'` from the same function.

62. **`welcome_sent_at` means "dispatched without a provider error", not
    "delivered".** With no `RESEND_API_KEY` nothing is ever delivered, and a
    timestamp that only filled in production would make the queue's "welcome
    not sent" flag useless on this machine. A real Resend failure leaves it
    null, which is exactly what that flag and the resend button are for.

63. **A brand with no packages still gets a welcome email.** Half the payload is
    missing and the budget block drops out, but the franchisee has just been
    registered and told to expect something. A misconfigured brand must not turn
    into a franchisee who heard from nobody at the one moment goodwill is
    highest.

64. **The signage number is computed in one place** — `src/lib/budget.ts`, which
    now owns `toQuantityLines` and `totalsFor` (moved out of
    `budget-one-pager.tsx`, which re-exports them). Three surfaces quote that
    figure: the PDF, the welcome email, and the level-1 page. A franchisee reads
    two of them side by side and forwards one to a lender, so they must be the
    same arithmetic rather than three that currently agree.

65. **The budget sheet has two doors, and the second one is the act of
    registration.** `/api/documents/budget/{slug}/{format}` stays team-gated
    (#44); `/api/documents/welcome/{token}/{format}` serves the identical
    document to whoever holds a registration token. That is not a weaker gate —
    corporate decided to hand this person the sheet when they registered them —
    and the document is still not published.

## Session 5a — the §6 amendment (spec v2.2)

66. **#51 answered: fulfillment moved to the PACKAGE, and the request status
    became a rollup of its packages.** SPEC §6 offered the two tails as
    alternatives on one request status and said nothing about a request that is
    both. Three shapes were weighed. A request-level `partially_accepted` fixes
    acceptance only — Signage.com still could not start production while the
    vendor half was open, and `shipped` would have had no honest meaning.
    Splitting routing into sibling requests needs no §6 change at all, but breaks
    the token (two links), the timeline, and the budgetary quote, which covers a
    SITE. Package-level fulfillment was chosen because it is the pattern the spec
    already uses one level up: approval is item-level and the request status is
    derived from it, so fulfillment is package-level and the request status is
    derived from that too. No second status column, nothing to reconcile.
    Session 5 had already moved the MONEY to the package for the same reason
    (#52); this is the lifecycle catching up.

67. **The rollup rule is one line: the request sits at the stage of its least
    advanced package.** A site is not quoted until every recipient has quoted,
    not accepted until every package is committed, and not finished until every
    sign is up. It is monotonic for free — a package only advances, so the
    minimum only advances — but `isFulfillmentAdvance` enforces it anyway,
    because that argument holds only for data the rollup itself wrote. A
    hand-edited row or a backfilled migration must not be able to drag a
    franchisee's request backwards through a status it already announced.

68. **The tail is a property of the package, so the request-level transition
    check stopped narrowing by it.** `canTransition` used to refuse
    `accepted → in_production` on the external tail. Every edge is now reachable
    by the rollup — `accepted → completed` when every package is external,
    `accepted → in_production` as soon as the least advanced package is an
    internal one that has started — so the tail check moved to
    `canPackageTransition`, where it means something. §4 was amended to say this
    outright.

69. **`completed` still writes installed_signs, and now writes only its own
    package's items.** The hard rule in CLAUDE.md is intact; the level moved. On
    a split site that is the whole point: Signage.com's signs go on the location
    record when Signage.com installs them, rather than waiting on a vendor who
    may be weeks behind. The smoke suite asserts both halves of it — our sign
    present, theirs absent, until theirs is actually up.

70. **The stage is derived from dates, not stored in a column.** `delivered_at`
    and `accepted_at` were already the idiom on `quotes`, and the invoice, the
    receipt and the timeline are all written from those dates. A stored stage
    could disagree with them; a derived one cannot. The ordering a status column
    would have given for free is enforced by five check constraints instead,
    because an out-of-order write does not error — it produces a package that
    silently reads as shipped without ever having been accepted.

71. **#57 closed by #66, with no change to the invoice action.** The gate was
    always `quote.accepted_at`, never the request status — it simply could never
    be satisfied on a split, because nothing could accept that package. It can
    now, and the smoke suite issues a real invoice against Signage.com's half
    while the vendor's half is still open.

72. **The franchisee is told which half moved.** Every notification after routing
    now belongs to one package, so the numbers in it are that package's numbers —
    a franchisee told "your quote is $12,900" when only half the site was quoted
    would be reading a total nobody produced. `packageLabel` is null on a
    single-package request, which is the ordinary case: naming a package there
    would introduce a word they have never been told. The install email goes
    further and changes its claim outright — telling someone standing in front of
    their own building that it is finished when it plainly is not is the most
    visible wrong thing this system can say.

## Session 6 — the corporate dashboard

73. **Corporate's link is its own table, not a mode on `review_links`.** SPEC §10
    says four words about it — "corporate dashboard: magic link" — and the two
    credentials differ on every axis that matters: scope (a brand, not a
    request), lifetime (30 days of a working bookmark, not 7 days to decide),
    uses (many, not one — reading is not an act), and revocation (never on
    package version, because it approves nothing). A single table with a mode
    column would have had to branch on that column at every one of those points,
    which is four chances to give a dashboard link a reviewer's powers by
    accident. `corporate_links` is a separate table with a separate resolver.

74. **The dashboard link authorises reading, and the schema enforces it.** The
    argument for a long-lived multi-use credential rests entirely on it being
    unable to change anything, and that claim was too important to leave as a
    comment. `app.corporate_brand()` resolves the presented token to a brand id,
    every policy written against it is `for select`, and `verify-schema` now
    reads `pg_policy` and fails if any policy mentioning `corporate_brand` is
    anything but SELECT. The links table itself stays closed to anon: a policy
    letting a token find its own row would invite enumeration of the rest and
    answers nothing the server-side resolver does not already know.

75. **The approvals view shows everything and decides nothing.** The demo's
    corporate persona has a second tab that IS the reviewer's screen, buttons and
    all — correct in a demo where one person plays everybody. In the product they
    are different credentials, and letting a 30-day bookmark approve signage
    would quietly replace the credential SPEC §10 was careful about (signed,
    single-use, 7 days, dead the moment the franchisee edits the package) with
    one that is none of those things. So the tab renders the same detail the
    reviewer's page renders, from the same `getRequestById`, and offers exactly
    one action: **send the approval email again**, to the address already
    configured on the brand. That is the realistic ask — "I can't find the
    email" — and it cannot be pointed at a new recipient.

76. **The §8b export and the §8d registration panel gain a home on the dashboard
    and keep their place on `/admin`.** #44 and #61 put both on the team queue
    "until corporate has somewhere to stand", which reads as a promise to move
    them. They are not moved, they are duplicated, and the reason is the business
    model rather than tidiness: Signage.com operates this portal white-glove, the
    vendor-policy card on the new dashboard says "contact your Signage.com
    manager to change it", and every one of these is something a franchisor
    telephones about. Deleting the team's copy would trade a support capability
    for a tidier screen. What is NOT duplicated is the actor: registering from
    the dashboard writes `registered_by = 'corporate'`, which is the whole point
    of §8d and the thing #61 was waiting for.

77. **"Program spend" means committed, and is read per package.** The demo sums
    every quote total, which in the real model is neither one thing nor the
    other. This counts packages someone has **accepted** — the franchisee on the
    internal tail, the team logging the order on the external one — because that
    is the moment money is owed. Per package rather than per request (SPEC §6 as
    amended): the seeded split request has one accepted half and one still out
    for a number, and a request-level figure is either double or nothing. What is
    quoted and not yet accepted is real and is not the same claim, so it is named
    in its own sentence underneath. Custom-quote lines stay out of the total for
    the reason #45 gives — a franchisor plans against this number.

78. **"Package complete" counts against the brand's own package, duplicates
    included.** A location is complete when its installed signs reach the length
    of `brand_packages.items` for its format — and that array's duplicates are
    meaningful (SPEC §3.2: an endcap takes 2× storefront letters because it has
    two elevations). Counting distinct sign types would call an endcap finished
    with one elevation bare. It is a completeness check and is worded as one:
    the portal never promises an approval or permit outcome, and a fully signed
    location can still be waiting on a city.

79. **Only `/admin` has a `loading.tsx`, and the reason is the 404.** A segment
    with a loading file streams, and a streamed response has already flushed its
    shell by the time `notFound()` is called — so Next answers **200** instead of
    404. Every other page in this build resolves a credential and calls
    `notFound()` when it fails. On those, "this link is dead" is worth more than
    a shimmer on a page that renders in a few hundred milliseconds, and two smoke
    assertions that had been checking for 404 quietly went green against 200
    while the skeleton was in place. `/admin` authenticates by redirect, never
    404s, and is the one screen an operator opens cold across every brand.

80. **`/admin` and `/dev` are `force-dynamic`, and the production build had never
    succeeded.** `npm run build` failed on this machine — Next prerendered
    `/admin`, `authProvider()` correctly refused to run in production without a
    Supabase project, and the build exited. The guard was right and the question
    was wrong: an authenticated console decided per request by who holds the
    cookie has no meaningful build-time render. `/dev` is forced dynamic for a
    different reason — a prerendered outbox is a snapshot of whatever mail
    existed when the build ran, served forever, which for the one screen whose
    job is "what did we send, and when" is worse than not having it. The build is
    green for the first time; nothing else in the app needed changing.

81. **`NotifyOutcome.sent` meant "the provider delivered it", which is false for
    every message this build has ever sent.** `sendEmail` returns `delivered:
    false` from the outbox, and `notify` and `franchisee` both reported that as
    `sent`. Nothing had ever read the value, so it had never been wrong out loud
    — the corporate dashboard's re-send button was the first caller, and it told
    a franchisor the email could not be sent while the email sat in the outbox.
    `welcome.tsx` had already settled this convention the other way and written
    down why (#62): `sent` means dispatched without a provider error. The other
    two now agree with it, and `result.delivered` is still there for a caller
    that wants the stronger claim.

82. **Days-to-opening is computed by Postgres.** The location card wants "opens
    in 12 days", which needs a *now* — and a component may not have one: the
    clock is not a pure input, and the lint rule that says so is right. The
    database has a now, it is the same one every other date on the page was
    derived from, and it does not drift against the viewer's laptop.

83. **`brands_public` gained `corporate_cc`.** The vendor-policy card states a
    brand's own routing rule back to them, and whether packages copy corporate is
    part of that rule. It is a boolean about policy, not a contact address — the
    franchisee is already told it in the routing note — so it belongs in the view
    rather than forcing the dashboard to read the row that carries three email
    addresses. The schema check that `brands_public` exposes no contact emails
    still passes, and still means what it says.

## Session 6a — the RLS behaviour tests

84. **The largest untested assumption did not need Docker.** Every session since
    the first has recorded the same gap in the same words: the app connects as
    the table owner, an owner does not consult RLS, so the policies are verified
    as valid SQL and never as behaviour — and behavioural tests were said to
    need a Supabase project or Docker. That was wrong, and it was wrong from
    Session 1. **PGlite is real Postgres.** It has real roles, and RLS is
    enforced against any role that does not own the table. The harness had
    already been creating `anon`, `authenticated` and `service_role` for the
    policies to reference; nothing had ever tried *being* one.

85. **What is genuinely absent is the INPUTS, not the policies.** GoTrue mints
    no JWT here and PostgREST forwards no `x-access-token` header. Neither is
    part of a policy — they are values a policy reads, and both already have a
    documented fallback: `app.access_token()` falls back to a session GUC (which
    the migration wrote for "server-side code and tests" a year before there
    were any tests), and `auth.jwt()` is a stub whose only job is to return
    claims. The stub now returns whatever the session put in `app.test_jwt`,
    which is what lets a test be a particular signed-in person. So the suite
    exercises the real policies with supplied inputs, and the day a real
    Supabase project exists the same assertions should be re-run through it —
    what would be new then is GoTrue and PostgREST, not the rules.

86. **The suite proves it can fail before it is trusted.** A green access-control
    suite is worthless unless something makes it red, so both policies were
    deliberately weakened and the run watched. Opening the corporate policy from
    `brand_id = app.corporate_brand()` to `app.corporate_brand() is not null`
    tripped 2 checks; opening `requests_token_read` to `using (true)` tripped 8.
    Then both were restored. A suite that has never been seen to fail is a suite
    nobody has tested.

87. **The shape checks were giving false assurance, and this is how we found
    out.** With `requests_token_read` opened to `using (true)` — every request in
    the database readable by anybody presenting nothing — the schema phase still
    printed `ok  anon reaches requests only through a token policy`. It asked
    whether *some* policy on `requests` mentioned `app.access_token`, and the
    sibling UPDATE policy did, so `.some()` was satisfied while the SELECT policy
    was wide open. It now asks whether **every** anon policy names a credential,
    and is renamed to say so. The lesson generalises: a check written as "does
    the safe thing exist?" passes for as long as the safe thing exists *beside*
    the unsafe one.

88. **Two of everything, and the ids captured while seeding.** A single brand can
    only prove a token reads its own row; proving it reads nothing else needs a
    second brand, a second location and a second franchisee. The first draft of
    the cross-brand checks identified "Beta's rows" by joining `brands` — which
    is precisely what anon is forbidden to do, so they failed with `permission
    denied for table brands` rather than with an answer. The fixture now captures
    the brand id as the owner and the checks filter on `brand_id` directly. A
    test that trips over the thing it is testing reports the wrong result.

89. **The suite gets its own database.** The schema phase mutates rows and the
    storyline phase drives a request to `completed`. "Can this credential see
    that row" is not a question worth asking about someone else's leftovers, so
    `runRlsChecks` builds a second throwaway instance from the same migrations
    (`scripts/pglite-harness.ts`, extracted for the purpose) and seeds a fixture
    it fully controls.

## Session 6b — the Supabase path, written down and made runnable

90. **The Storage bucket is private, and reads keep going through
    `/api/files`.** A public bucket would have been one line less code and would
    have turned every stored path into a permanent anonymous URL — for a
    photograph of a franchisee's building, and for the lease exhibit sitting
    beside it in the same table. The driver reads through the service role
    instead, and `fileUrl()` still points at the app's own route, which is the
    one place a rule can be added later. Signed URLs remain available as a
    change to a single file, which is what that route's header promised in
    Session 2.

91. **No fallback in either direction.** Setting `SUPABASE_STORAGE_BUCKET`
    selects Supabase; unsetting it selects local disk; neither silently
    substitutes the other. That was already true when the Supabase branch was a
    deliberate `throw`, and it stays true now that the branch works: a
    deployment whose bucket name is wrong must fail loudly rather than write a
    lease exhibit to a container filesystem that the next deploy discards.

92. **An upload Storage refused must never return quietly.** `putUpload` returns
    a `storagePath` and the `request_files` row is written from it afterwards, so
    a swallowed error is a photo the franchisee believes they sent and nobody can
    open. Similarly, a broken bucket must NOT read as a missing object: a 404
    becomes `null` (which `/api/files` turns into a 404), and every other error
    throws. Both states end in an empty page and only one of them is our mistake.
    Pinned in `src/lib/storage/__tests__/supabase-driver.test.ts`, which was then
    checked by breaking the error mapping and watching the right test go red.

93. **The driver reads its two variables directly, not through `serverEnv()`.**
    That validator demands the whole configuration at once, Resend key included.
    Storing a file must not require a mail provider to be configured, and a
    validator that insisted would make this throw for the wrong reason — the
    same argument `src/lib/email/sender.ts` already makes for rendering an email
    into the outbox.

94. **`npm run migrate` exists, because nothing could apply migrations to a real
    database.** The dev server applies them to `.pglite/` and `db:verify`
    applies them to a throwaway; a Supabase project could only be built by
    installing and linking the Supabase CLI. "Point `DATABASE_URL` at Supabase
    and the same SQL runs there" has been in the seed's header since Session 1
    and was not actually reachable. It is now: a ledger table, one transaction
    per file, and the whole thing tested against a bare Postgres carrying only
    the roles and `auth.jwt()` that Supabase supplies — 11 applied, re-run
    reports nothing to do, and `npm run seed` then runs against it.

95. **A schema with no ledger is refused, not attempted.** Pointed at the dev
    database — which applied its own migrations and never recorded them — the
    runner cannot tell what still needs applying, and re-running migration 1
    against existing types produces a rollback and an error that explains
    nothing. It now says what happened and offers `--baseline`, which records
    the history without executing it.

96. **`docs/SUPABASE.md` is a runbook, not a description.** The four things
    written-and-never-run — the seed against a real project, the Auth path,
    Resend, and RLS through PostgREST — were each recorded as an owed item in
    prose, which is how they stayed owed for five sessions. They are now numbered
    steps with the exact commands, including the two `curl` calls that prove RLS
    is being applied by the platform rather than by our WHERE clauses, and the
    deactivate-a-team-member check that proves the allowlist half of `/admin`.

### Corrected while building Session 5

- **An enum array from `pg` is a string, not an array.** `getBrandsWithPackages`
  aggregated `location_format` values and `pg` has no parser registered for that
  type's array OID, so `formats` arrived as the raw `'{endcap,inline}'`. That is
  worse than an error: a string still answers `.length`, so it passed the
  emptiness check and only failed later at `.map`, in the component rather than
  the query. Fixed by aggregating `format::text`, which pg parses natively.

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
