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

### Open items this session did not touch

Unchanged from CLAUDE.md: the Design Studio integration path, the pilot brand's
real vendor policy, the stamp decision, the business model, the DID fee amount,
and the v13 flow demo. Session 0's `docs/design-studio-findings.md` question
list for Usman is still unanswered.
