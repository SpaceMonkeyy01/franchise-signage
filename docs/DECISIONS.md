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

## Session 6c — the outbox earns its place

97. **The outbox moved from `/dev` to `/admin/outbox`, behind the allowlist.**
    Session 4 left the question open in as many words: "keep it only if it earns
    its place, and put it behind `/admin` if it does." It earns it — "what
    exactly did we send them, and when" has a right answer and this is the only
    place holding it — so the answer is both halves at once.

    The environment flag it had been living behind was never the right guard.
    `DEV_CONSOLE=1` was written when `/dev` was the temporary operator console
    and expected to be deleted; what survived is a page that renders WHOLE
    EMAILS, and those emails carry live credentials — a reviewer's signed
    approval link, a franchisee's status token, a corporate dashboard link.
    Anyone who set that flag in production to look at one thing would have
    published every one of them. The allowlist that decides who may approve a
    package is the right guard for a page that can read the approvals.

    The path moved rather than just the guard, because `/dev` promises a
    development tool and this is a support tool. It now inherits the operator
    chrome, the `force-dynamic` the segment already needed, and a link in the
    admin header — findable from every screen, never competing with the queue.
    Two smoke checks: signed out it shows nothing, signed in it is one click
    from the queue. Confirmed by removing the guard and watching the first fail.

98. **Two comments that had been stale since Session 4 went with it.**
    `getRequestQueue` and `routeRequestForQuote` both said the temporary console
    at `src/app/dev` was their only caller; that console was deleted in Session
    4 and `/admin` had been calling both ever since. `getRequestQueue`'s comment
    mattered more than tidiness — it explains why the query is deliberately NOT
    token-scoped, and the sentence justifying that pointed at a caller which no
    longer existed. It now names the guard that actually makes it safe.

## Session 6d — the Supabase project, and what running it found

The four items owed since Sessions 1, 3, 5 and 6a were all owed to the same
missing thing: a project. One now exists, and standing it up turned three
written-and-never-executed paths into three bugs. The entries below are as much
about how they hid as about how they were fixed.

99. **The pgcrypto search_path names both schemas rather than qualifying the
    call.** Supabase installs pgcrypto into an `extensions` schema; `create
    extension pgcrypto` with no schema — what the dev database does — puts it in
    `public`. `app.corporate_brand()` pins `set search_path`, correctly, as every
    security-definer function here does, and so resolved `digest()` locally and
    could not on Supabase.

    Three fixes were possible. Schema-qualifying the call (`extensions.digest`)
    hardcodes an environment difference into the SQL and breaks the other one.
    Moving the extension makes the migration responsible for the layout of a
    database it does not own, and on Supabase the extension is already installed,
    so `if not exists` would quietly do nothing. Naming both schemas in the
    search_path works in both directions and costs nothing: Postgres ignores a
    schema in the path that does not exist. Unpinning the search_path was never
    on the table — it is the guard, not the problem.

    Worth recording that `npm run db:verify` was green before, during and after.
    The PGlite harness models the ROLES faithfully, which is what it was built
    for, and the extension layout not at all. Any future security-definer
    function that reaches into an extension has the same exposure and the same
    fix.

100. **A bucket error throws; only a missing object reads as absent.**
    `isNotFound()` matched `/not found/i` anywhere in the error message, and
    Supabase answers a bad service-role key with **"Bucket not found"** — a
    caller that cannot authenticate cannot see the bucket, so it is told the
    bucket is not there. The result was that a misconfigured deployment returned
    `null`, which `/api/files` turns into a 404: a franchisee's site photo and
    lease exhibit reported as never uploaded.

    The three cases are, read off the live service:

        absent object   Object not found   status 400, statusCode "404"
        wrong bucket    Bucket not found   status 400, statusCode "404"
        wrong key       Bucket not found   status 400, statusCode "404"

    The status codes are identical, so there is nothing to branch on but the
    message — which is unpleasant and is the whole of what the API offers. The
    guard is therefore explicit about refusing the bucket case first, and says
    in a comment where the shapes came from and when, because the next person
    will reasonably assume a 404 is a 404.

    A bad key and a wrong bucket remain indistinguishable from each other. That
    is acceptable: both are our misconfiguration, both must be loud, and neither
    may be reported as the franchisee's absence.

101. **The tests that guarded this had invented the error shapes.** They pinned
    a bad key as `Invalid JWT: signature verification failed` with status 401 —
    plausible, and nothing the service has ever returned. The test asserting
    that "a broken bucket is not read as a missing file" passed while the code
    did exactly that. Rewritten against the observed shapes and confirmed to go
    red without the fix.

    The general point is worth more than the fix: a stub written from
    imagination tests the imagination. Where the shape of a failure IS the
    contract — as here, where two failures differ only in a string — the stub is
    worth no more than the day someone checked it against the real thing.

102. **`/auth/callback` is a new route handler, and it authorizes nothing.** The
    magic link had no way to become a session: nothing called
    `exchangeCodeForSession` or `verifyOtp`, and the link pointed at `/admin`,
    which cannot write a cookie. `supabaseEmail()` had been written to ignore
    cookie writes and explained why — "Refresh happens in the route handler that
    completes the magic link" — referring to a handler that was never built.

    Three calls inside it. It accepts **both** the PKCE (`code`) and token-hash
    link shapes, so changing the project's email template cannot silently break
    sign-in. It refuses any `next` that is not same-origin, because an open
    redirect on the end of an authentication flow is worth more to an attacker
    than on any other page. And it establishes identity only — whether that
    person is on the team stays with `getTeamMember()`, on every request, in the
    one place it has always been decided. Duplicating the allowlist check here
    would have been the intuitive move and would have created a second place to
    forget.

103. **`shouldCreateUser` stays true, and is now explicit.** A team member's
    first sign-in has no Supabase user, and this is what creates it. It reads
    like self-serve access and is not: the allowlist is checked before any link
    is sent and again on every request afterwards. The Supabase user is an
    identity; `team_members` is the authorization. Written out because the next
    person to read that line will reach for the opposite value.

104. **`signOut()` signed nobody out.** It deleted the dev cookie and left the
    Supabase session untouched, so under the only provider where it mattered the
    button reloaded the page and left the member signed in. Both are cleared
    now. Nothing had caught it because nothing had ever run the Supabase path.

105. **The session pooler, not the direct connection.** `docs/SUPABASE.md` said
    to use the direct connection and avoid the pooler, on the correct reasoning
    that the migration runner needs transactions and session-level settings. But
    `db.<ref>.supabase.co` is IPv6-only on projects provisioned since about 2024
    and is unreachable from this machine; the failure is a bare TCP timeout that
    suggests nothing about addressing. The **session** pooler (port 5432) is
    IPv4 and keeps both properties — it is the **transaction** pooler (6543)
    that drops them. The runbook now says so, and says where the password comes
    from, since Supabase shows it once and never again.

106. **`.env.local` rests in PGlite mode, and the four Supabase lines go
    together.** Presence alone decides two things — `src/lib/auth/team.ts` picks
    its identity provider on it, and `src/lib/storage/index.ts` picks its driver
    — so a partial switch reads one database while storing files against
    another. And in Supabase mode `npm run smoke` cannot run at all: it signs in
    through the dev picker's `<select>`, which the magic-link page does not
    render.

    That last point is the reason the resting state is PGlite rather than the
    real project. The 167-check suite is the only regression net this build has,
    and a configuration that disables it is a configuration to switch on
    deliberately, use, and switch off — not one to leave lying around. Steps 4,
    7 and 8 of the runbook are the deliberate use.

107. **The Auth path is proven, except the branch a real email uses.** Nine
    checks pass in one run against the live project: the link completes at
    `/auth/callback`, a session cookie is written, `/admin` renders the queue,
    **deactivating the `team_members` row locks the caller out on the very next
    request**, reactivating lets them back in, Sign out leaves no session cookie
    and `/admin` then redirects, and a bogus link is refused with a message that
    says why. That third one is the half of SPEC §10 that actually decides
    access, and it had never executed.

    What is NOT proven is the **PKCE (`?code=`) branch**. The checks above drove
    the token-hash branch, because it can be reconstructed from the database; the
    emailed link uses PKCE, and reproducing it needs a fresh `signInWithOtp` in a
    live browser, which Supabase's built-in mailer rate-limited. The branch is
    four lines beside one that works, and the flow is confirmed to be PKCE — the
    verifier cookies appear — but confirmed is not the same as executed. One
    click on a link from a real inbox settles it.

    Two measurement traps are worth recording, because both produced a confident
    wrong answer first. A Server Component `redirect()` lands as a **second**
    navigation, so asserting on the URL after `domcontentloaded` reads the page
    that is about to redirect and reports the lockout as broken when it works.
    And `pool()` caches its Pool in `globalThis` at first use: Next hot-reloads
    `.env.local`, the pool does not follow, so a dev server started in PGlite
    mode goes on reading PGlite while every other part of the app has moved to
    Supabase. That one cost the most — it looked exactly like a failing allowlist
    lookup, with the correct email and a row that plainly existed.

108. **A magic link only works in the browser that requested it, and that is
    left as it is.** PKCE stores a code verifier in a cookie at
    `signInWithOtp` and needs it back at the exchange, so requesting a link on a
    laptop and opening the mail on a phone fails. For an operator console — one
    person, one work machine — that is the right trade: the verifier is what
    stops a link intercepted in transit from being usable elsewhere.

    Written into `sendMagicLink`'s header rather than fixed, because it is a
    support question when it happens and there is nothing to fix in this
    codebase: the remedy is the project's email template carrying
    `{{ .TokenHash }}` instead, which `/auth/callback` already accepts and which
    needs no verifier. That is a deliberate loosening, and it should be someone's
    decision rather than a default.

    *Superseded by #111 (Sep 2026): magic links are gone, and nothing Supabase
    mails or redirects is on any path now.*

## Session 9a — accounts, phase A (spec v2.3 §9b)

109. **The whole §10 schema landed in phase A, though phase A uses one role.**
    Profiles, franchisee companies, memberships with a staff store scope,
    invitations and resets, `locations.franchisee_id`. The expensive thing to
    change later is the shape — who owns a store — not the screens, and §10.7 D2
    said as much. Phases B–D add pages and policies, not tables.

110. **`app.is_team_member()` was redefined rather than replaced.** Every
    `team_all` policy in the build calls it, so changing its body to "holds an
    active platform_admin membership" moved all of them off the allowlist in one
    statement. `team_members` stays, grants nothing, and has a check proving so.

111. **Invitations and password resets are our tokens, not Supabase's flows.**
    Both go out through the same Resend pipeline and outbox as every other
    message, and both links are resolved by this app — so they work on a
    different device from the one that asked, which a PKCE link does not (#108).
    Supabase is used for four things only: create an account, check a password,
    set a password, and TOTP. No redirect URL needs registering.

112. **The dev provider is a real password login now, not a picker.** scrypt
    hashes, server-side sessions, real RFC 6238 codes, in a `dev_auth` schema
    that exists only in the dev database. A stand-in that trusted the browser
    would have left every screen in this phase unexercised by the smoke suite.
    The seeded admin's password and authenticator secret are published in
    `src/lib/auth/dev-auth.ts` on purpose; the dev provider refuses production.
    The two-factor page shows the current code **in dev only**, for anyone
    running the demo without an authenticator app.

113. **The database enforces two-factor for Signage.com, not only the app.**
    `app.is_platform_admin()` requires `aal: aal2` in the JWT. The app connects
    as the table owner, so its own check is the one that runs; the policy means
    a password-only Supabase session reaches nothing through PostgREST either.

114. **Sessions are read by id in the action that creates them.** A cookie set
    in a Server Action is the NEXT request's to read, so sign-in and acceptance
    decide "where next, and is a code owed?" from the user id they just
    authenticated rather than from `getViewer()`.

115. **Account lockout is counted on `profiles`, not left to the provider.**
    Supabase rate-limits by IP, which does nothing for one account guessed at
    from many addresses. Five failures lock for 15 minutes; a password reset or
    an admin clears it. Unknown addresses and wrong passwords get the same
    sentence, so sign-in cannot be used to learn who has an account — and
    neither can forgot-password.

116. **Departure from §10.6: the team's old sign-in does not keep working
    until each person accepts.** The spec said it would. There are no
    production users, the magic-link path is removed (#111), and keeping it
    alive for a transition nobody needs would be a second sign-in to secure.
    The team re-onboards by invitation: `npm run invite` for the first admin,
    `/admin/team` for the rest.

117. **An account can't replace its own authenticator from a half-signed-in
    session.** Otherwise a stolen password could swap the second factor out.
    Lost phone → another admin resets it from `/admin/team`, and the owner
    enrols again at their next sign-in. Nobody can reset their own.

118. **The dev database applies new migrations now.** It used to skip them all
    once a schema existed, so every new migration meant a reset. A ledger
    (`dev_migrations`) is baselined to the eleven files that predate it, and
    anything newer is applied at start, in a transaction per file.

## Session 9b — franchisee accounts, phase B (spec v2.3 §9b)

119. **The brand home was public, and listed every store with its request
    links.** Right for a one-franchisee pilot with no logins; wrong the moment a
    second franchisee exists, because anyone who opened `/freshbites` could open
    every request in the brand. It is "My stores" now: signed out it offers
    sign-in and names no store; signed in it is scoped by `storeScope()`. The
    intent picker, add and replace pages, reachable before by store id alone,
    are behind the same scope.

120. **Only quote acceptance moved behind the owner (§10.7 D1).** The request
    link still opens the status page, answers a change request and downloads the
    documents, as before; accepting — the one action that commits money —
    needs the signed-in owner of that store, or Signage.com. Staff cannot
    (§10.2). A link-only visitor sees "Sign in to accept". Narrow on purpose:
    D1 kept the links so notifications stay one tap, and this is the one thing
    a forwarded link must not do.

121. **The welcome email's main button is the owner invitation; re-sending
    mints a fresh one.** v2.2 kept the same link alive on a re-send. An
    invitation creates an account, and two live ones for one person is one too
    many, so a re-send retires the earlier invitation. The registration's own
    page — the second, no-account link — is unchanged and still works.

122. **The lease question is asked at sign-up, not configured per brand (D7).**
    "Have you signed a lease yet?" sends an owner into store setup or to the
    level-1 view. The spec allows a per-brand "always straight to setup"; no
    brand has asked, so it is not built.

123. **A store Signage.com sets up on someone's behalf starts unowned.** The
    admin is not a franchisee and the setup form does not ask whose it is. It
    stays visible to the brand and the team until attached — by the backfill,
    or by hand. Not worth a picker until it happens.

124. **Brand admins and reviewers see every store on the brand home, read-only,
    until phase C gives them their dashboard behind sign-in.** No "Request
    signage" and no "Set up a store" for them (§10.2: corporate approves, it
    does not order).

125. **The owner backfill is a dry run unless told otherwise.** §10.6 wants the
    team to review inferred owners before they apply; `npm run backfill-owners`
    prints the plan, `-- --apply` does it. Nobody is emailed: the accept links
    are printed, or the brand registers the franchisee and the welcome email
    carries a fresh one. Someone who already owns a company on the brand gets
    the stores attached to it rather than a second company.

126. **A schema check was reading policy NAMES as roles.** "Every anon policy
    on requests names a credential" treated anything not called `team_*` as
    anon, so the first signed-in franchisee policy failed it. It reads
    `polroles` now, and has a signed-in twin: every authenticated policy on
    requests is the team's or scoped by `app.can_see_location`.

127. **The budget one-pager downloads for anyone with a role on its brand.** A
    franchisee could already get it from their welcome page with the
    registration link; this is the same sheet through their account.

## Session 9c — corporate in-app, phase C (spec v2.3 §9b)

128. **The dashboard decides, and #75 is answered as §10.3.4 said it would
    be.** Behind sign-in the credential is the person, not a 30-day bookmark,
    so the Approvals tab carries the same Approve / Request changes / Decline
    cards the email's page does — one component, `src/components/ReviewPanel`,
    with each route passing its own actions already bound to its credential.

129. **One decision function for both routes.** `src/lib/review/decide.ts`
    owns everything after the credential: the state machine call, the event,
    retiring the emailed link when nothing is left pending, and the one
    franchisee email per review (#39). The link resolves its token; the
    dashboard checks the membership; neither does anything else. Line items
    gained `reviewed_by_email`, `reviewed_by` and `reviewed_route` (`link` |
    `session`), and each event's detail carries `via` and `by`. `event_actor`
    was NOT extended with `via_link` / `via_session` as §10.3.4's wording might
    suggest: the actor is still who (reviewer, or `team` when Signage.com
    decides on a brand's behalf, which §10.2 allows) and the route is a fact
    about how, so it sits beside the actor rather than multiplying it.

130. **An item settled elsewhere says so, by whom and how.** The email's
    per-item buttons deep-link with `?item=`; when that item was decided
    since the email went out, the review page opens with "Neon Leaf was
    already approved by Jordan Reyes from the dashboard on Sep 28." A click
    that races the other route gets the same sentence instead of the state
    machine's "not awaiting review". This is §9b phase C's demo, and the
    smoke suite drives it end to end.

131. **`corporate_links` retired by making the helper answer nothing.** The
    migration revokes every live row, and redefines `app.corporate_brand()` to
    return null — the move #109 made with `app.is_team_member()` — so every
    anon policy that called it goes quiet at once without being re-created.
    The table stays, read-only, for one release (§10.5). The RLS suite's
    fixture writes its links AFTER the migrations, so a link that is still
    live in the table is what proves the retirement; weakening the function
    back turned that check red. The public "email me a link" form, the link
    email template, the operator's link panel and the walkthrough's minting
    are deleted, not hidden.

132. **An old dashboard link lands on "Dashboard links have been replaced",
    not a 404.** They sit in bookmarks and inboxes; the page offers sign-in
    and looks nothing up, because the answer is the same whether the token
    was ever real.

133. **Approval emails go to every active `brand_reviewer`, one link each
    (§10.7 D4).** `mintReviewLinks` revokes the previous sending once, then
    mints a link per reviewer, so the reviewers of one sending hold live links
    side by side and whichever decides first, the others' pages then say so.
    Brand admins are not mailed — D4 names reviewers, and D3 gives admins the
    dashboard, not the inbox. A brand with no reviewer accounts still mails
    `reviewer_email` with its secondary copied, and that address stays the SLA
    escalation target either way. Visible change: in the dev seed the approval
    email now goes to `reviewer@freshbites.com`, not `brand@freshbites.com`.

134. **What each corporate role sees (src/lib/auth/corporate.ts).** Reviewers:
    the dashboard, Approvals (deciding), the budget sheets. Brand admins, and
    Signage.com: those plus the §8d registration panel and a People tab. A
    signed-in person with no corporate role on the brand gets a 404, the same
    answer every other miss in this build gets. The brand home now sends
    corporate to the dashboard (retiring #124's read-only store list); Signage.com
    keeps the store list, because it orders there.

135. **People manages exactly two roles.** A brand admin invites and
    deactivates brand admins and reviewers — franchisees arrive by the §8d
    registration, staff by their owner (phase D). Nobody can deactivate
    themselves, as on `/admin/team`. Two-factor reset and lockout clearing
    stay with Signage.com: they touch the auth provider, and a brand admin
    resetting a reviewer's second factor is a recovery path worth a
    conversation before it exists.

136. **Brand roles gained read policies, and still no write policy.**
    Registrations for admins and reviewers; memberships, invitations and the
    matching profiles for admins. Every corporate write runs server-side and
    checks the membership itself; a brand admin writing a request directly is
    refused, and the suite checks that by attempting it.

137. **The pilot seed gains `brand@freshbites.com` (brand admin, Morgan Ellis)
    and `reviewer@freshbites.com` (reviewer, Jordan Reyes)**, dev passwords
    only, per §10.6. On a real project they come from `npm run invite --
    <email> --role brand_admin --brand freshbites`.

## Session 9d — staff and brand portals, phase D (spec v2.3 §9b)

138. **Brand portals are a rewrite, not a second app.** `src/proxy.ts` reads the
     host; on `{brand}.<BRAND_PORTAL_DOMAINS>` it serves `/{brand}/…` (so
     `/corporate` is the dashboard) and every page is the one that already
     exists. The decisions inside it are all in `src/lib/portal.ts`, which is
     pure and unit-tested:
     - **Path-based URLs keep working everywhere**, on the portal too, because
       every link the app builds and every email already sent uses them.
     - **Shared routes pass through untouched**: sign-in, two-factor, password
       reset, invitations, the reviewer's link, `/api`. They are not brand
       pages, and prefixing them would break every link that points at them.
     - **The console is not served on a brand's address** (404), nor another
       brand's pages: one brand per address (§10.4).
     - **No database in the proxy.** An unknown subdomain rewrites to a slug
       that does not exist and 404s like `/nosuch` does, so the proxy stays
       fast and never fails on a database outage.
     - **A page learns it is on a portal only from the proxy**: the
       `x-brand-portal` header is set on a portal host and stripped on every
       other, so a client cannot claim one. Sign-in uses it to wear the brand
       and to land the person on that brand (`homeFor(…, portal)`), including
       someone with roles at two brands.
     - **Each brand's session is separate** for free: cookies are host-only.
     - **In development, `*.localhost` is always a portal domain**, so
       `freshbites.localhost:3000` works with no DNS; production uses only what
       `BRAND_PORTAL_DOMAINS` names.

     SPEC §10.4 expected a Supabase redirect URL per brand. None is needed:
     invitations and resets are our own tokens, and Supabase never redirects to
     the app (DEPLOY §3). What remains outside the code is wildcard DNS and a
     wildcard custom domain on the host.

139. **Store staff are managed as a company's, one role per person per brand.**
     An owner invites a manager to named stores from `/{brand}/staff` (linked
     from their home), changes the stores, deactivates them, or withdraws an
     invitation; each takes effect on the manager's next click, because scope
     is read on every request. Inside that:
     - **Someone already staff at another franchisee of the brand cannot be
       invited**; they belong to that company, and the memberships index allows
       one staff role per person per brand. A deactivated manager is
       reactivated, not re-invited, so their history stays one membership.
     - **Changing stores replaces the set** (at least one store), and every
       store id must be one of the company's; the form having offered only
       those is not the check.
     - **Staff order and answer change requests for their stores; they do not
       accept quotes or set up stores** (§10.2, §10.7 D1–D2), and they have no
       staff page.
     - RLS lets an owner read their company's staff, store scopes and staff
       invitations, and a staff member their own scope; every write is
       server-side. The pilot seed gains Riley Chen
       (`riley@freshbites-austin.com`, Oak Plaza only): the phase D demo is "a
       manager sees one store of two".

140. **A brand admin sees and manages every franchisee company's people**, from
     a Franchisees section on the corporate People tab: each company's owners
     (deactivate, reactivate) and its store staff (invite to named stores,
     change stores, deactivate, withdraw an invitation). Asked for directly on
     28 Sep, and it is what §10.2 already said — "invite or deactivate store
     staff: brand_admin ✓", brand-wide — which phase D's first cut had narrowed
     to the owner alone. The staff rules live once, in `src/lib/staff.ts`,
     scoped by franchisee company; the owner's `/staff` screen and the corporate
     tab both call them, and the same `StaffManager` renders both. What the
     corporate side adds is only the reach: the company named must be one of
     the brand's. Two calls inside it worth your view:
     - **Deactivating an owner is allowed**, though §10.2 has no row for it. A
       franchisor whose franchisee leaves the system needs a way to cut access
       that is not a phone call to Signage.com. The confirmation says the cost:
       nobody at that company can accept quotes until an owner is active again.
     - **A brand admin cannot add a second owner or invite a new one here.**
       Owners still arrive only by the §8d registration, because the welcome
       email is the franchisee's first contact and must not have a second path.
     RLS gains two read policies for the backstop (companies and staff store
     scopes); every write stays server-side, checking the membership itself.
     **The §8d registration panel appears in the section too** (asked for the
     same day), as well as on the Dashboard. A company exists only once its
     owner accepts, so without it a registered-but-not-yet-signed-up franchisee
     would be invisible from the one place a brand admin manages franchisees.
     Same component and action, so it still writes `registered_by = corporate`
     and sends the unchanged welcome email.

## 29 Sep — ideas taken from an outside concept page

A "Freshbites Signage Studio" concept page was shared on 29 Sep. What it adds is
presentation, not model: every fact it shows we already hold. Two ideas were
taken on the user's go-ahead; its product name, its "local codes verified" and
compliance claims, and its self-serve "start a package" button were not (CLAUDE.md
names, the never-promise-compliance rule, invitation-only accounts).

141. **Package readiness is derived, never stored, and never gates.**
     `src/lib/readiness.ts` reads the request the pages already load — location
     address and opening date, a photo per sign, sizing and TBD flags, the item
     decisions, the lease exhibit and the latest `landlord_criteria_reviewed`
     event — into rows with three states: done, to follow up, with corporate.
     Rows follow the intent: `initial_setup` gets all five, `add` its photos,
     sizing and approvals, `replace_like` its condition photo and approvals (its
     sizing is inherited). One `ReadinessCard` renders on the franchisee's
     status page and the team's console, until a quote is accepted. The spec is
     silent on a readiness view; it is built only from §3's TBD rule and §8b's
     criteria flag, and its copy says Signage.com follows up — a flag is never a
     condition. `EventRow` now carries `detail` so the criteria result is read
     from data, not parsed from the summary.

142. **The brand portal's signed-out root is a landing page.** Hero, an
     example readiness card labelled as an example, five steps from invitation
     to installed signs, and sign-in — written entirely from the brand record,
     so it serves any brand. The rules of v2.3 §10.2 hold: no store, no request
     link, and no "start" button, since accounts come only by invitation. Its
     warm off-white ground is local to this page; the app's screens are
     unchanged.

143. **Signs grouped by site zone (storefront, roadside, drive-thru, entry,
     interior) is NOT built.** The taxonomy only splits indoor/outdoor, so it
     needs a zone on brand items — a schema and seed change, waiting on a yes.
     The concept's numbered elevation is input for the §8c DID (Session 8).

144. **Signage.com and each brand have their own sign-in, and `/` asks which**
     (asked for on 29 Sep, for demos). The team signs in at `/sign-in`, now
     "Sign in to Signage.com"; a brand's franchisees and corporate sign in on
     the brand's portal, whose sign-in already wore the brand and kept its own
     session (§10.4). `/` lists Signage.com and every brand from the database;
     a brand's card points at its portal (`portalOrigin`: `*.localhost` in
     development, `{brand}.<portal domain>` deployed) and falls back to the
     path-based pages on a host outside every portal domain. Signing in stays
     one mechanism: the page's look follows the portal, or a brand page named
     in `next` (so "sign in to accept" on a request still shows the brand), and
     the account still decides where it lands — a franchisee on Signage.com's
     sign-in is not refused, just sent to their stores. The development hint
     lists only the accounts that belong on each page. This replaces the
     temporary quick links of the same day.

145. **A store mid-setup shows its stages on "My stores"** (asked for on 29
     Sep, with Cedar Park as the example). The demo only says "Setup in
     progress"; the card now reads the initial-setup request's status (§6, the
     least advanced package on a split) as six stages — store set up,
     approvals, quote, production, shipped, installed — with the opening date
     counted down, a sentence on what is happening, and a button only when the
     move is the franchisee's (review the quote, answer a change request). The
     mapping is `src/lib/setup-progress.ts`, unit-tested; it disappears once
     the request completes and the installed signs take its place.

146. **The console can have its own address, apart from the brands'** (asked
     for on 30 Sep: one address for the Signage.com team, another for the
     franchise portal; option 1 of three — one deployment, two addresses — over
     two services of the same code or a split codebase). It is switched on by
     configuration alone: `APP_URL` under a configured `BRAND_PORTAL_DOMAINS`
     domain (`https://admin.signage.com` with `signage.com`) makes that host the
     console's. There, a brand's page is sent on (307, not 308 — browsers keep a
     308 forever, and the address is a setting) to the brand's address without
     the slug: `admin.signage.com/freshbites/request/abc` →
     `freshbites.signage.com/request/abc`, so every path-based link already in
     an inbox still arrives. `/admin` still 404s on a brand's address. The
     console's host is never read as a brand, whatever its subdomain. Emailed
     links follow: franchisee status and location links, the welcome page,
     approval links, and invitations and password resets for brand accounts go
     to the brand's address, since the session they start belongs to the
     address it starts on; the team's own links stay on `APP_URL`. The console's
     sign-in turns a brand account away with the address to use — which amends
     #144's "not refused" for this mode only, because a brand account signed in
     on the console would be sent to its brand's address holding no session
     there. Off by default: development with no `BRAND_PORTAL_DOMAINS`, and any
     deployment whose `APP_URL` is a bare hosting address, serve everything
     everywhere as before.

147. **Once split, the hosting address sends everyone to the console's.** Any
     host that is neither the console's nor a brand's — `*.onrender.com`, the
     bare `signage.com` — answers a 307 to the same path on `APP_URL`, which
     then sends a brand's page on to the brand (#146). So the app is reached by
     its two kinds of address only, and no session starts on a host no email
     links to. `/api` is exempt and answers everywhere (cron, file links), and
     the health check moved from `/` to a new `/api/health` so it sees the app
     rather than a redirect.

## 30 Sep — the catalog, managed in the app (SPEC v2.4 §2.3)

Asked for on 30 Sep: a sign-management page for corporate over a catalog the
Signage.com team keeps. The user's calls: **prices are Signage.com's only**;
**corporate's package edits go live at once**; **a new sign is proposed and
the team approves it**, and once Design Studio (§8) is connected the proposal
also carries its mockup and engine price. Spec v2.4 records it, replacing §9
item 7's "CRUD UI only when onboarding brand #2".

148. **A proposal is a brand item that is `pending` and inactive.** Not a
     separate table: every query that already filters on `active` — the
     franchisee catalog, request creation, packages, budget numbers, anon RLS
     reads — keeps it out of sight with no change, and approval is one update.
     A check constraint makes "live" imply "approved". Declined proposals stay,
     with the reason, until the brand revises or withdraws them.

149. **No brand role ever enters a price.** Corporate's form has no price field
     and the actions take none; RLS refuses a brand admin's insert with a price.
     The team sets it on approval (or leaves "Custom quote"; a standin master
     row can have no other) and can change it later on `/admin/catalog`.
     Past requests keep their `est_price_snapshot`.

150. **Retiring a sign takes it out of every package at once**, and
     reinstating does not put it back — re-adding is the brand's package
     decision. Installed signs and past requests keep it. Replacing one where it
     is installed: #155.

151. **After approval, a sign's name and spec are Signage.com's to change.**
     Line items read them live (only the price is snapshotted), so a rename
     rewrites every past request and email. Corporate can retire and propose a
     replacement instead.

152. **`standard` is now decided on the server, from the package** (found
     while mapping the code). Setup trusted the browser's `fromPackage` flag,
     and `standard` auto-approves, so a forged flag skipped corporate. Each
     package entry now covers one line item: an endcap's two storefront sets
     are both standard, a third is an add-on.

153. ~~Store types stay inline, endcap and freestanding.~~ Answered: brand-defined,
     #156.

155. **A retired sign can still be replaced where it is installed — through
     corporate** (asked on 30 Sep: "maybe on a request for approval"). The line
     item is still a like-for-like `replacement`, with the installed sizing and
     spec, but it is `pending_review` instead of the fast lane, so corporate
     can approve it or suggest a current sign. Under `approval_mode = never`
     nothing goes to corporate, and it auto-approves as before. Request
     creation accepts an inactive item only for a replacement; everything else
     still needs a live sign.

156. **Store types are the brand's own** (asked for on 30 Sep: "Drive-thru,
     standalone, mall in-store"). `brand_store_types` holds each brand's list;
     `locations.format` and `brand_packages.format` became text keys into it,
     with a composite foreign key so a store cannot name another brand's type.
     The three existing values are the keys of three default types every brand
     starts with (a trigger on `brands`), so no row changed and every fixture
     still works. The key is derived from the first name and never changes (it
     is on stores and in the budget-sheet URLs); the label is renamed freely.
     Ordering is the brand's `sort_order` rather than the enum's, and labels
     come from the table everywhere: setup, budget sheets, the portfolio, the
     vendor email, the console. A retired type is not offered at setup and has
     no budget sheet; the last live type cannot be retired. The unused enum
     type is left in place.

157. **Signs can carry an uploaded picture** (asked for on 30 Sep). A brand
     sign's picture fills the `thumbnail_url` §2.2 always had (as a storage
     path); a sign type's icon is the new `master_catalog.icon_path`, set by the
     team once per type and placement. Everywhere a sign is drawn — catalog
     cards, setup, installed signs, status page, approvals, console, packages —
     the order is the sign's picture, then its type's icon, then the schematic.
     Brand admins upload their signs' pictures (a picture is not a price); the
     team uploads type icons and any sign's picture. PNG, JPG or WEBP up to 5 MB
     — not the PDF or HEIC request photos allow, since an `<img>` must show it.
     Served through the existing file route, where the unguessable path is the
     credential, as for every other upload. Emails and PDFs are unchanged.

158. **The page is a drafting board** (asked for on 30 Sep: "a lot of white").
     A faint 24px grid with a stronger line every fifth sits behind every page
     (`body::before`, fixed, fading toward the bottom and sides, never printed),
     tinted with the brand colour on a brand's pages and neutral on the
     console. Brand headers carry a soft wash of the brand colour into the page.
     Cards stay white — the demo's card language, and they carry forms and
     prices — with a faint shadow, and whole-card links lift on hover
     (`.card-lift`). Motion is limited to the two signed-out front pages, where
     the grid lights up around the pointer (`CursorGlow`), only for a mouse and
     never under reduced motion; working screens stay still.

159. **Pages widen with the screen** (asked for on 1 Oct: "on a monitor it
     looks too compact, empty space left and right"). Fixed caps of 672–896px
     gave way to three width tiers in `globals.css` that grow at 1280 and
     1536px: `page-wide` (dashboards, queues, lists, and every header, so the
     shell lines up), `page` (one record), `page-narrow` (forms, kept narrow on
     purpose). From 1680px the root font steps up (17px, then 18px at 2240px),
     scaling every rem with it. The two request pages — the franchisee's and the
     console's — go two-column from 1280px: the work in the main column,
     readiness, files and history beside it, in reading order on anything
     smaller. Corporate's sign list goes two-up; installed signs three-up. The
     console header now wraps on a phone, where it ran 98px off the screen.

160. **Cards say each thing once** (agreed 1 Oct). On the franchisee's request
     page, items are grouped by status under one chip and count — what needs
     the franchisee first, then waiting, declined, approved, pre-approved —
     instead of the same chip on every card; the pre-approved line never
     mentions corporate. Until a quote exists, an **Estimate** card adds up the
     direct-priced signs and counts the custom-quote ones ("$18,750 + 3 custom
     quotes"), declined signs left out, labelled an estimate and not a quote.
     **Departing from the demo**, corporate's dashboard drops the amber "N items
     awaiting your approval" banner: the Awaiting approval tile is itself the
     link ("Review now →"). Each location lists its open requests one per line —
     code, the six setup stages as a compact bar, status, and "N awaiting you"
     linking to Approvals — where it used to show bare status chips with no way
     to tell which request each belonged to. Light grey body text
     (`text-gray-400`, about 2.5:1 on white) is `text-gray-500` (about 4.8:1,
     passing WCAG AA) everywhere but the dark console header and a struck-through
     retired row.

161. **Corporate's review opens at package prep, and the code now enforces it**
     (agreed 1 Oct). SPEC §6 puts `needs_review` after the team prepares the
     package, but the dashboard counted every `pending_review` item, so
     corporate saw "22 awaiting approval" when 20 had not been prepared or
     emailed. Worse, `decideLineItem()` and `requestChanges()` checked only the
     item: a signed-in reviewer could decide a `submitted` request from the
     Approvals tab, and the last decision moved it straight to `approved`,
     skipping prep (and a change request reopened items before its status move
     refused). Both now throw `ReviewNotOpenError` unless `isReviewOpen()`; the
     metric, the location cards, the Approvals tab, the console's "with
     corporate" count and the readiness line ("go to corporate next") use the
     same rule. **The rule has to include resubmission:** the machine's only
     exit from `changes_requested` is `submitted`, yet the re-review email goes
     straight back to corporate with no second prep. Only resubmission raises
     `package_version`, so `submitted` above v1 counts as open. Worth a spec
     look: sending a resubmission to `needs_review` would make the status say
     what it means, but it changes the status machine, so it is not done here.
     *(Done the same day: #162.)*

162. **Two status-machine corrections** (asked for on 1 Oct, answering #1 of
     "decisions waiting on you" and the question #161 left open).
     **A request whose every item is declined ends at a terminal `declined`**
     (additive enum value; `needs_review → declined`). It used to derive to
     nothing — `blocked: 'all_items_declined'` — and sit in review forever,
     counted as open on every dashboard with nothing able to close it. Open
     requests now exclude it everywhere `completed` was excluded; the queue has
     a Declined bucket. A request with any item left standing still goes to
     `approved`. **A resubmission lands on `needs_review`**
     (`changes_requested → needs_review` replaces `→ submitted`).
     `applyResubmission()` already derived that and said so; `resubmitRequest()`
     ignored it, so a resubmitted request read "Submitted", sat in the team's
     Needs prep bucket, and #161 needed a package-version special case to count
     it as with corporate. That special case is gone: `isReviewOpen()` is the
     status alone. The migration moves resubmissions already sitting at
     `submitted`, writing a `status_changed` event for each. SPEC §6's diagram
     should gain the `declined` end and the resubmission edge.

163. **Corporate's dashboard leads with the work; reference goes below**
     (asked for on 1 Oct). **Departing from the demo**: the dashboard's
     "Franchisee registrations" panel is gone — the People tab already had the
     same form ("Register a new franchisee", inside Franchisees), so it was a
     duplicate, and registering starts an account, which is People's subject.
     The vendor-policy card above the locations is now one line of text below
     the budget sheets: corporate set it at onboarding and reads it rarely. The
     dashboard is now metrics, then locations, then reference. /admin keeps its
     own registration panel (#76).

164. **The Design Studio flow, from the owner (2 Oct) — SPEC v2.6 §8.** The
     brand admin designs each brand sign in the Studio (logo, background,
     options, dimensions) and makes it standard by adding it to a package;
     franchisee owners and staff open the Studio from any listed sign, adjust
     it, and confirm before submitting. The owner's answers:
     - **Price:** Signage.com's, fetched automatically from the Studio; neither
       the brand nor the customer does anything about price. Built so the
       server fetches it (a browser-posted price is display only), because a
       price the portal trusts from the page is a price anyone can edit.
     - **What a franchisee may change:** agreed — each setting locked, or
       adjustable within limits; within limits keeps the sign's approval route,
       outside them makes it an exception for corporate.
     - **Quote confirmation:** the owner trusts the engine and expects to drop
       team confirmation later, so it is a per-brand setting, not a rule. A
       payment gateway for orders may follow (SPEC §12 Q11, out of MVP scope
       until decided).
     - **Studio unavailable:** "let's see". Until decided, §8's existing rule
       stands: nothing blocks on the Studio.
     Not yet built: waiting on the Studio code and API, which the owner is
     providing, and on a margin policy (fulfillment cost → price, §12 Q12).

165. **Margins: per brand and per sign type, set by the team** (owner, 2 Oct;
     answers SPEC §12 Q12). `pricing_margins` holds a standard margin (40% to
     start, "a standard value for now"), an optional default per brand, and an
     optional margin per brand and sign type; the most specific applies. Set on
     `/admin/pricing`, team only.
     - **A margin, not a markup:** price = cost ÷ (1 − margin), the way
       Signize's own estimates compute it. The old Studio copy's placeholder
       treated 45% as a markup on cost; a 40% margin is a 67% markup.
     - **"Sign type" is `master_catalog.sign_type`** (e.g. Illuminated
       Channel Letters), the level the engine prices; its variants share a
       margin. Custom-quote (standin) types are not listed: they are priced by
       hand.
     - **No brand role sees a margin.** The table has a team-only policy, and
       a change is logged to `catalog_events` with no brand_id, which brand
       roles cannot read. `scripts/rls-behaviour.ts` checks both.
     - Not applied to any price yet: nothing calls the engine until the
       Signize integration is built. The engine call is proven by hand (2 Oct,
       session login: 24" Halo Lit letters, $310 cost, 14 days, ~14 s).

166. **The brand admin's Design Studio** (built 2 Oct; SPEC v2.6 §8 points 1–2,
     5). `/{brand}/corporate/design/{signId}`, from "Design" on the Signs tab:
     logo (upload, or the brand's own), options from the sign type's engine
     data, one dimension, optional depth; Preview prices and renders through
     Signize; Save prices again on the server and sets the sign's est_price
     (price_source 'engine'), locked choices, spec line, design and rules.
     - **Engine route: the session endpoint** `/api/sign-pricing` with
       `SIGNIZE_SESSION_TOKEN`, because the keyed v1 API refuses a session and
       takes fewer options. One call returns cost AND a mockup (~0.5 MB JPEG),
       so the mockup is stored with every quote and is the sign's picture
       wherever it is drawn, after an uploaded one.
     - **Cost never sits beside price where a brand can read it.** brand_items
       is brand-readable, so the design holds our price only; cost, margin and
       Signize's quotation id go to `engine_quotes` (team only, RLS-checked).
     - **Rules:** unlisted settings are locked; a new design starts with the
       size adjustable a quarter either way; a choice list always includes the
       design's own value, and a range must contain it.
     - **Billed calls:** Preview runs on request, never per keystroke; quotes
       are cached for six hours and identical in-flight calls are shared.
     - Saving a design changes a live sign's price at once ("Signage sets the
       price, automatically fetched", owner, 2 Oct). A proposal still waits for
       the team's approval to go live (§2.3).

167. **Franchisees adjust a design while ordering** (built 2 Oct; SPEC v2.6
     §8 points 3–4). A designed sign with anything left adjustable shows
     "Customize in Studio" in setup (package and add-ons) and "Add a new sign":
     only the open settings, with their limits; Preview prices and renders;
     "Use this design" keeps it for the request.
     - **Checked and priced on the server, before the transaction**
       (`src/lib/designs/submit.ts`): pricing is a ~15 s network call, and the
       dev database serves one connection at a time. The browser's price is
       never used.
     - **Outside the limits:** a standard sign becomes an `exception` with the
       breaches as its issue; an add-on (reviewed anyway) carries them in its
       site notes. Going outside is allowed and warned, not blocked — corporate
       decides, as SPEC §7 has it for exceptions.
     - The line keeps the design, the Studio price as its snapshot
       (`price_source` 'engine'), its size as the sizing text, and the mockup
       as its `mockup_file_id` — the first time a request carries a generated
       mockup rather than a team upload.
     - **Not for like-for-like replacements:** they reorder what is installed.
     - Smoke covers access only (brand admin reaches the Studio; a reviewer
       gets no link and a 404): engine calls are billed and CI has no Signize
       credential. The engine path is unit-tested on its request and response,
       and was driven end to end by hand on 2 Oct (34" letters outside an
       18–30" limit: $1,000, flagged, submitted to corporate).

168. **The sign quote sheet** (owner, 2 Oct: "do what you think is good").
     The Signize Studio makes a one-page "Quote" PDF in the browser; ours is
     made on the server on the §8b letterhead (Signage.com first, the brand
     second), so it is our document and never carries Signize's cost.
     - **One page per designed sign:** mockup and estimated price side by
       side, the engine's side view (copied into our storage once per
       drawing), a two-column specification, materials, turnaround, and an
       "estimate, not a quote" disclaimer. A unit test holds it to one page.
     - **Stored at submission** as a `quote_sheet` request file on the line
       (migration `20261002110000`), so the franchisee, corporate and the team
       open the same record of what was chosen; listed on the request card,
       corporate's review card and the console. Never fatal: a failed sheet
       leaves the request whole.
     - **Previews are downloadable, not stored:** the franchisee from
       "Customize in Studio", the brand admin from the Studio, both stamped
       PREVIEW and priced again on the server. **A brand's own sheet** for a
       designed sign is on the Signs tab, for any corporate account.
     - **The budgetary quote now ends with each sign's mockup** (Studio or team
       upload), so the lender sees what the money buys.
     - Vendor packages already show prices and attach item files, so the sheet
       goes to vendors too; its spec and side view help them build.
     - A design changed on resubmission would get a new sheet beside the old
       one (the history is kept); the resubmit screen does not yet offer the
       Studio, so today this cannot happen.

169. **Found driving a franchisee's setup end to end** (2 Oct, on the owner's
     ask: reset the order data, then set up a store and order as Dana would).
     - **Uploads were open to anyone.** `uploadPhoto` stored any file for any
       caller. It now needs Signage.com, an active role on the brand named by
       the upload, or one of that brand's request links (the signed-out
       change-request answer).
     - **A phone photo crashed setup.** Server Actions accept 1 MB by default;
       our upload rule is 10 MB, so a 1.5 MB photo threw "Body exceeded 1 MB"
       and the page fell to the error screen. `bodySizeLimit: '11mb'`. Smoke
       never saw it: its test images are a few bytes.
     - **Opening dates landed a day early ahead of UTC.** "Jan 15, 2027"
       parsed as local midnight and was stored through `toISOString()`, so a
       server east of UTC kept Jan 14. Render runs in UTC, which hid it.
     - **A designed sign ordered as-is now carries the brand's design**, its
       mockup and its quote sheet (no engine call: the brand's design is
       already priced). Before, only customised lines did.
     - **A line ordered from a design reads as that design** — its spec line
       and picture — not the brand's default; the franchisee's site note is
       kept beside the Studio size rather than replaced by it.

170. **REQ-0912 driven from submission to installed, by hand** (2 Oct). Team
     prepared it; corporate's reviewer approved the add-on from the dashboard
     with a note; the team routed it (one package, Signage.com), priced the two
     custom signs ($1,200, $950) and delivered $4,983; Dana downloaded the
     budgetary quote (both Studio mockups under "Sign designs") and accepted;
     the team invoiced INV-0727, recorded the loan disbursement, and moved it
     through production, shipping and installation. Riverside's record holds
     five installed signs; corporate's dashboard reads $4,983 program spend.
     Every email went where it should, the vendor package carried both quote
     sheets and the 30" Studio size, and no page threw. Fixed on the way:
     - the remaining "(s)" plurals, in email subjects and previews ("1 sign(s)
       need approval"), the routing timeline entry, the console's waiting
       line and the SLA events;
     - an installed sign shows the mockup of the line it came from (Dana's
       30" letters), not the brand's 24" default.
     Noted, not changed: approving a request's last pending sign removes its
     card from the Approvals tab at once, taking the "approved." confirmation
     with it; the tab then reads "Nothing is waiting on you", which says it.

171. **Mockups are drawn in the sign's own style; Freshbites keeps only the
     signs the Studio can price** (owner, 2 Oct: "pricing name is of no
     concern … I just want to be able to generate the mockups"; "we will only
     have those signs set up for Freshbites for now"; the Freshbites logo).
     - **The pricing call's picture is generic** — halo-lit letters on a wall
       for an A-frame and a lightbox alike. The Studio now draws each sign with
       the mockup engine (`POST /api/generate-mockup`) in its
       `master_catalog.render_key` style onto Signize's indoor or outdoor
       scene by placement, alongside the pricing call; the pricing picture is
       only the fallback when that drawing fails.
     - **An unknown style is not an error there:** it quietly draws letters.
       Opening Banner had no render_key; it gets `vinyl-graphics-wall-wraps-full`
       (the old Studio's choice; Signize has no banner style), by migration
       `20261002120000` and in the seed TSV.
     - **Mockups work for the custom-quote types too** — a pylon and window
       frosting render properly — so they can be designed for pictures later
       even though their price stays manual. Not built yet: those types are
       deactivated for Freshbites.
     - Freshbites now: seven active signs, every one designed with its logo
       and engine-priced (Storefront $700, Lobby $333, Menu Board $667, Blade
       $467, A-Frame $133, Neon Leaf $167, Banner $467); Window Frosting,
       Entrance Sign and Road Sign inactive (Riverside keeps its installed
       ones). Packages hold Storefront and Lobby letters only.

172. **Team confirmation of quotes is a per-brand switch** (SPEC v2.6 §8
     point 5; built 5 Oct). `brands.team_confirms_quotes`, default on, so no
     brand changes until the team turns it off on `/admin/pricing` (team only,
     logged to catalog_events with no brand, beside the margins: it is
     Signage.com's call about its own prices). Off: when the team routes a
     request, each Signage.com package whose every item is priced goes
     straight to quote_ready and the franchisee gets the quote email; the
     event is the system's ("priced by the engine; no team confirmation for
     this brand"). Still the team's, either way:
     - **prep and routing** — the switch removes one step, not the console;
     - **a package with a custom-quote item** — those prices are always manual
       (§2.1), so it waits for the team to price it and press Deliver;
     - **an external package** — the vendor quotes off-platform.
     A direct-priced item counts as priced whether the engine or the catalog
     set it: both are Signage.com's prices (#165, SPEC v2.4 §2.3). When to turn
     it off for Freshbites is the owner's call (SPEC §12 Q13).

173. **The Studio draws custom-quote signs; it never prices them** (built
     5 Oct; the open item in #171). A standin type with a mockup style
     (`master_catalog.render_key`: pylon, monument, frosting, decals, wall
     wraps, plaques, post-and-panel, yard sign) can be designed by the brand
     admin: logo and size only, drawn by the mockup engine, no pricing call.
     - **No options:** a standin row's options are its stand-in pricing
       model's (channel letters' raceways on a pylon), not choices about the
       sign, so the Studio offers none.
     - **Price untouched:** saving stores the design and rules only —
       est_price stays empty, price_source stays `team`, and the spec line
       and locked choices the brand set by hand are kept. Lines ordered with
       it carry `price_source = 'team'` and no snapshot: a custom quote the
       team prices, as before (§2.1). Nothing goes into engine_quotes.
     - **Everywhere else it is a design:** franchisees see the drawing and
       may change the size within the brand's range ("Customize in Studio"),
       the Signs tab offers Edit design and its quote sheet, and the sheet
       reads "Custom quote" instead of a price.
     - **No style, no Studio:** awnings, wayfinding, digital displays,
       vehicle wraps and the rest without a render_key keep their standard
       picture; the Design page says so. Freshbites' Entrance Sign is one.
     Locally Window Frosting now has a design (still inactive); whether to
     activate it and the Road Sign is the owner's call.

174. **The DID generator is skipped for now** (owner, 5 Oct). Session 8
     (SPEC §8c) is not built; nothing in the build depends on it. The rules
     in CLAUDE.md and SPEC §8c stand for when it returns — the stamp rule
     above all — and the welcome email keeps saying nothing about a DID it
     cannot deliver. Session 7 is counted done: the Design Studio landed
     through the Signize engine (#166–#173) rather than the iframe the
     session plan describes.

175. **The signed-out landing page shows the brand's signs** (owner asked to
     improve it, 5 Oct). The hero is the brand's own Studio mockups (a
     standard-package sign large, three more small) instead of the example
     readiness card, which moves to a "Nothing slips, and nothing blocks"
     section. Added: three "what you get" points, a gallery of every live sign
     with a picture (standard-package signs first and badged), and five FAQs;
     the header carries a Sign in link. **Names and pictures only, never
     prices** — prices are for signed-in franchisees (smoke checks no "$" on
     the page). Every claim is what the product does today; no DID copy.
     **Revised the same night:** the readiness card on the landing page is
     now an example store panel (landing only; the shared ReadinessCard on
     the request page and console is unchanged): a store header, the six
     setup stages as a checked tracker at Approvals, the "now" line, three of
     the brand's real signs with their approval state, and the readiness rows
     with an icon each (pin, camera, ruler, badge, document), a state badge,
     value pills and a progress bar. The points beside it got their own icons.

176. **A store with no order yet gets its standard package** (owner, 5 Oct:
     "difference between Request signage and Choose your signs?" — both
     opened the intent picker, where every sign is an add-on). A store on
     record with no setup order and nothing installed now shows only "Choose
     your signs", which opens `/{brand}/location/{id}/setup`: the initial-setup
     checklist against that store (its format from the record, never the
     browser), so standard-package signs auto-approve exactly as in new-store
     setup (§7). `submitFirstOrder` shares setup's item and origin logic and
     refuses a store that has started. "+ Request signage" appears once the
     first order exists. Arose because the local reset left Oak Plaza and Cedar
     Park with no orders; also covers any store created without one.
     Not changed: catalog signs outside the package are still add-ons that
     corporate reviews (§7). A per-sign "approve automatically" option was
     offered to the owner and not yet chosen.

177. **Stores can be edited, with a history** (owner, 5 Oct: "once we set the
     store we are not able to edit or change that info"; agreed design).
     "Edit store" on each store card, for the owner of the store's company
     and Signage.com (`/{brand}/location/{id}/edit`): name, address, opening
     date at any time; **store type only before the store's first order**,
     because it decides which signs are standard and auto-approve (§7) and an
     owner switching it mid-order could turn an add-on into a standard sign.
     Signage.com may change it at any time; orders already placed keep their
     approvals. Each change is a `location_events` row (who, what), shown as
     the store's change history. Migration `20261005100000_location_events.sql`
     (RLS: team all; read by whoever can see the store; behavioural check
     added). Saving merges into the stored address, so a line2 the form does
     not show is kept. Staff cannot edit (they order, they do not own).

178. **Freshbites' store types and packages tidied** (owner, 5 Oct, after a
     review of the names: Inline / Endcap / Freestanding kept as the standard
     terms). Done as the brand admin through the catalog functions, so each
     change is in the catalog history: packages renamed to their store types
     (Inline, Endcap, Freestanding) with plain descriptions; the Freestanding
     package, which said "with road sign" but held the Inline signs, now has
     2× Storefront Letters, Lobby Letters and the Road Sign — reinstated and
     designed in the Studio (96" pylon, custom quote). **Local data only**;
     the live project's Freshbites rows were not changed. Drive-thru and
     non-traditional types were suggested and not added (only if Freshbites
     has such sites).
     Found doing it: a first Studio design kept its default size limits at
     18–30" whatever size was typed, so a 96" sign could not be saved ("limits
     must include the design's own value"). The limits now follow the size
     until the admin sets them.

179. **The team chooses where each sign type's price comes from** (owner,
     5 Oct: "a toggle which says where the price will be picked from; Design
     Studio, Custom etc."). `master_catalog.price_mode`, set per variant on
     `/admin/catalog` ("Price from"), logged as `price_mode_set`:
     - **Design Studio** — the engine prices each design, plus the margin
       (/admin/pricing lists only these types now);
     - **Fixed price** (new) — Signage.com sets each brand sign's price by hand
       (the existing price editor); the Studio draws it, and its preview, quote
       sheet and orders carry that price, always the current one, recorded as
       a team price;
     - **Custom quote** — priced per order, as before.
     `pricing_basis` stays in step (custom = `standin`, else `direct`; a check
     enforces it, and a trigger fills `price_mode` for rows inserted without
     one). Switching to Custom quote clears the type's brand-sign prices
     (confirmed on screen); to Fixed keeps them as the starting figure.
     Migration `20261005110000_price_mode.sql`. Existing rows: 50 Studio,
     27 Custom; nothing switched to Fixed yet.
     **Refined 6 Oct:** a fixed-price sign must have a price — approving one
     without it, or clearing it, is refused (to quote per order, set the type
     to Custom quote). The team's catalog flags live fixed-price signs with no
     price (amber tab count, banner, highlighted row, "Set price"); switching
     a type to Fixed offers a link to set its brand signs' prices; the
     approval form's price field follows the type (required for Fixed,
     optional estimate for Studio, none for Custom).

180. **The team's Brand signs table explains each sign** (owner, 6 Oct).
     Under each sign: the store-type packages that hold it ("In Endcap ×2 ·
     Inline", or "an add-on"), and its catalog history folded away (last 8:
     approvals, designs, price changes). Under a Studio price: Signize's cost
     and the margin applied, and — when today's margin would give a different
     price — that price and "re-save the design to apply". Cost stays team
     only. `src/lib/catalog/details.ts`.

181. **Drive-thru** (owner, 6 Oct: "one of the store types will be a drive
     thru site"). Signage.com catalog: Freestanding Signs → Drive-Thru Signs,
     four variants, custom quote to start — Outdoor Menu Board and Pre-Sell
     Board (Studio-drawn as `light-box`), Clearance Bar (no style; standard
     picture), Directional Signs (`post-panel-sign-standard`); also in the
     seed TSV (81 rows, 31 standin). Freshbites: a Drive-thru store type
     ("A freestanding building with a drive-thru lane"), the four signs
     (proposed by the brand admin, approved by the team), three of them
     designed in the Studio with the logo (menu 72", pre-sell 48",
     directional 30"), and an 11-sign Drive-thru package: the Freestanding
     seven plus the four. The team can switch any of them to Fixed price.
     Real drive-thru mockup styles would need Signize to add them.

182. **Live Freshbites designed through the engine** (owner, 6 Oct: "use the
     token"). Render's environment is not reachable from here (no CLI, the
     connector unauthorised), so the Studio's own save (`saveBrandDesign`)
     was run from this machine against live — live database, live storage,
     the local `SIGNIZE_SESSION_TOKEN` — for each of Freshbites' 12 local
     designs (inputs read from the local database; logos uploaded to live
     storage), as live's Freshbites brand admin. The engine priced and drew
     each afresh at live's 40% margin: seven engine-priced (within a few
     dollars of local — Storefront $717, Menu Board $683, Blade $483), five
     drawn custom quotes. Live packages now total Inline $2,816, Endcap
     $3,400, Freestanding and Drive-thru $2,917, plus custom quotes. The
     deployed Studio still needs `SIGNIZE_SESSION_TOKEN` set on Render for
     anyone to design there.

183. **The engine token can be saved from the console** (owner, 6 Oct: "have
     the code use my token"). Not hardcoded: a token in the source would sit
     in the repository's history and need a redeploy whenever it expires.
     Instead `app_settings` (team-only RLS, behavioural check added) holds it,
     saved from a "Design Studio connection" card on /admin/pricing (password
     field, never shown back; shows who saved it and when). The engine reads
     the host's SIGNIZE_SESSION_TOKEN when set, else the saved one
     (`src/lib/signize/token.ts`, cached a minute). Migration
     `20261006090000_app_settings.sql`. The owner's current local token was
     saved to live, so the deployed Studio works without touching Render.

184. **"Customize in Studio" opens the Studio** (owner, 6 Oct: it "just asks
     for any change in dimensions and shows a small preview"). The franchisee's
     adjust panel is now a full window (`StudioAdjust`, used by setup, add
     signs and change requests): the mockup large with its size, overall size
     and turnaround; a size slider and box within the brand's range; depth
     when allowed; choice options as buttons; what the brand set (logo,
     locked options) listed; a note when a change goes beyond the brand's
     limits; price, Update preview, Quote sheet, Cancel and Use this design
     (enabled once the preview matches the settings and differs from the
     brand's). Esc closes it. Behaviour behind it is unchanged: the preview
     prices on the server and submission checks and prices again.

185. **Flush/stud mounting by default** (owner, 6 Oct: "keep it Flush/stud
     mounted by default … missing the Backboard option … keep it this way
     across the settings and pages"). Freshbites' Storefront and Lobby
     Letters (the two signs with a mounting option) now mount Flush/Stud by
     default, and franchisees may choose Flush/Stud mounted, Standard Raceway
     or Backerboard Cabinet — re-saved through the engine, locally and on
     live (Storefront $700 → $567; Backerboard Cabinet prices at $917). The
     brand admin's Studio starts any new design with a mounting option at
     Flush/Stud; the seed's Storefront pin and spec line say flush/stud too.
     The catalog's option is named "Backerboard Cabinet".

186. **Franchisees complete their package after submitting** (owner, 6 Oct:
     "how do I add missing items … the package readiness card"). Until the
     quote (submitted → sent_for_quote), the request page shows "Complete your
     package" under the readiness card, listing only what is open: a site (or
     condition) photo per sign — saved the moment it uploads; a size for any
     sign still TBD; the lease sign exhibit and property manager; and, for
     unconfirmed location details, a link to Edit store. Each addition is a
     `details_added` request event naming who added it ("Dana Whitfield added
     a site photo for …"), so the team sees it on the timeline. Authorised by
     the request link, like the change-request panel; it changes no approval
     and no price. `src/lib/requests/complete.ts`. Readiness itself is
     unchanged and still never gates anything.

187. **Placement photos wherever signs are chosen** (owner, 6 Oct). Before,
     only the standard package (setup step 2) took a photo, inside each
     collapsed row; add-ons (step 3) and "Add a new sign" took none. Now each
     chosen add-on and each sign on "Add a new sign" has "Add placement
     photo" (saved as `placement_photo` on its line), and step 2's collapsed
     rows show "Photo added" or "Add photo" so a missing photo is visible
     before submitting. Still optional; "Complete your package" (#186)
     catches anything left.

188. **The store setup wizard redesigned** (owner, 6 Oct: review steps 1–4
     and improve layout, design and UX). A step bar (Location · Package ·
     Add-ons · Review; visited steps clickable, state kept) and, on a wide
     screen, a sticky "Your store" summary beside the steps: store, type,
     opening, signs, how many approve automatically and how many need the
     brand, photos added, running estimate. Step 1 in cards (Store, contact,
     lender, landlord), a date picker for the opening date, each store type
     showing its package estimate, and a hint saying what is needed to
     continue. Step 2: a summary strip, each row with its picture, price and
     photo state; the opened row puts the mockup beside the photo and notes,
     and asks for "Site notes" (not a size) when the design sets the size;
     Continue counts photos ("1 of 7 with photos"). Step 3: one approval note
     up top, whole picture cards to select with a clear selected state, the
     vendor tag only for an outside vendor. Step 4: the store details with
     Edit links back to each step, signs grouped "Approved automatically" /
     "Needs {brand} approval" with picture, detail, photo state and price,
     the estimate, and "What happens next". Same data, actions and smoke
     anchors (one heading renamed in smoke).

189. **The brand admin's Studio redesigned** (owner, 6 Oct). A status bar
     pinned under the site header: price, "Saved" / "Unsaved changes" (and a
     leave-page warning when unsaved), Quote sheet, Preview, Save. Each option
     is one row — its value, and a "Let franchisees choose" switch that opens
     its choices as chips (the default always included) — instead of a
     dropdown plus a row of checkboxes; options grouped Look / Installation /
     Technical, Technical folded. Size limits behind a switch, with a bar
     showing the range and the design's own size. A larger logo panel on a
     checkerboard. Beside the preview: overall size, turnaround, and "What
     franchisees can change" in plain lines. Same rules, actions and save
     behaviour. The franchisee's Studio window now also shows the price
     difference from the brand's design ("+$266 vs the brand's design").

190. **One place for the team to invite anyone** (owner, 6 Oct: "we should
     be able to select the company and the account type"). `/admin/people`:
     account type (Brand admin, Brand reviewer, Franchisee owner, Store
     manager, Signage.com admin), brand, and for a store manager the
     franchisee company and its stores; then email (and a name for an
     owner). Each goes through the function its own screen uses
     (createInvitation, registerFranchisee — the welcome email —, inviteStaff),
     so their rules stay single. The result shows the invitation link with
     "Copy invitation link", since live sends no email yet; inviteStaff and
     registration now return their link. Below: the last 40 invitations
     across the platform with their status.

191. **The operator console, audited and cut to five sections** (owner, 6 Oct:
     "some pages or sections may not be even needed"). Nav: Requests ·
     Catalog · People · Outbox · Settings, with Walkthrough set apart.
     - **People absorbs Team and the queue's registrations panel.** Tabs:
       Accounts (every membership, filter Everyone / Signage.com / Brand /
       Franchisee; deactivate, reactivate, clear lockout, reset two-factor
       for Signage.com admins), Invitations (withdraw a waiting one) and
       Welcome emails (open their page, resend; resend keeps the token).
       Deactivating is no longer limited to platform_admin from the team's
       side: the team may already reach every brand. `/admin/team` redirects
       to `?type=team`.
     - **Entry points became the Walkthrough's "All links" view**
       (`/admin/demo?view=links`, same guard); `/admin/entry-points`
       redirects. Reviewer approval links stay only in the outbox (#75).
     - **Pricing is Settings** (`/admin/settings`; the old address
       redirects): the Studio connection, then margins and the per-brand
       quote-confirmation switch.
     - **Brand documents** (the §8b budget PDFs) moved from the queue to
       the catalog's brand tab, beside the packages they price.
     - **Outbox:** filter by who it was for (Franchisees, Approvals,
       Vendors, Accounts, Catalog), search recipient or subject, request
       code on each row, the latest 50.
     - **Request page:** mockups and quote sheets fold under the Files card
       (they are on each line already); the landlord card's copy is one line.
     - The walkthrough's persona notes still said franchisees and corporate
       had no accounts; corrected.
     - Smoke: the quote-confirmation check waits for its own "turned off"
       row and for the "back on" save before clearing, which a back-to-back
       run had tripped on.

192. **The console gets the pointer glow, in Signage blue** (owner, 6 Oct).
     The landing pages' grid glow (`CursorGlow`) takes a colour, and the
     admin layout renders it in #2563eb. Same rules: a real mouse only,
     never with reduced motion.

193. **Signage blue is the default theme, and the glow is on every page**
     (owner, 6 Oct). The theme tokens default to Signage blue (#2563eb), so
     Signage.com's own pages (the main landing page, the console, sign-in
     without a brand) are blue; a brand's pages still set their colours with
     BrandTheme, so Freshbites stays green. The invitation page now wears the
     inviting brand's colours (it had relied on the old green default).
     `CursorGlow` is rendered once by the root layout in the page's colour,
     replacing #192's per-page placement and the "working screens stay
     still" rule.

194. **Signing out lands where the person signs in** (owner, 6 Oct review).
     It used to send everyone to `/sign-in` with no brand, so a franchisee or
     brand admin leaving a Freshbites page landed on "Sign in to Signage.com",
     which tells them they are in the wrong place; on a brand's own address
     the action's redirect also skipped the proxy and lost the brand. Now: from
     a brand's pages (portal header, else the posting page's first path
     segment, checked against brands) to that brand's front page, `/{slug}`
     explicitly; from the console or anywhere else to the Signage.com sign-in
     with "You have signed out."

195. **Freshbites screens refined** (owner, 7 Oct review).
     - **Dashboard status reads true.** The location chip is "In progress"
       while a request is open; with none open, "Package complete" when the
       installed signs cover the standard package, "Signs installed" when
       some are up (Riverside, signed before its package grew, read "Setup in
       progress"), else "Signs not chosen". The opening date uses the
       franchisee's own words ("Opened Sep 15", not "opens Sep 15 · overdue"),
       with "no signs up yet" in amber when it has passed with nothing up.
     - **Store names drop the brand inside its portal** (`storeName()`): "Oak
       Plaza", not "Freshbites — Oak Plaza". Emails, PDFs and the Signage.com
       console keep the full name.
     - **Request page, per sign:** a larger thumbnail that opens the mockup;
       files as short links ("Mockup ↗", "Quote sheet ↗") with the filename on
       hover; the sizing tag hidden when it repeats the spec line; the vendor
       tag only when the sign goes to an outside vendor.
     - **Complete your package** folds each group to one line ("Site photos ·
       11 to add"); a group of two rows or fewer starts open.
     - **The intent picker** shows the two working options; modify, remove
       and remodel are one "Coming soon" line instead of three greyed rows.
     - **Vendor policy** on the dashboard is one line with "Details".

154. **The master catalog is switched off, never deleted** (brand items point
     at it). A new variant of an existing sign type inherits that type's
     options and pricing model. **The team edits a row's options on screen**
     (asked for on 30 Sep): one list per attribute, one option per line, plus
     the render key. An option kept by name keeps its engine `var_name`; a new
     one gets a derived id the pricing engine does not know until Design Studio
     is kept in step, and the editor says so. `basic_fields` (the engine's
     sizing inputs) are not a choice and are left alone. A brand sign that
     already locked a removed option keeps it.

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
