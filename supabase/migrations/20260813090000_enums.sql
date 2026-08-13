-- Franchise by Signage — enums and shared helpers.
-- Contract: docs/SPEC.md §2–§6, §8b, §8c. Every enum here is additive-extensible
-- (ALTER TYPE ... ADD VALUE) so later sessions never need a destructive migration.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- app schema
-- Helper functions live in `app` rather than `public` so PostgREST never
-- exposes them as RPC endpoints.
create schema if not exists app;

-- ---------------------------------------------------------------- §2 catalog
create type placement as enum ('indoor', 'outdoor');

-- `standin` rows have no real pricing model yet and MUST be quoted manually
-- (SPEC §2.1). Derived, not returned by the Signize API — see
-- docs/TAXONOMY-NOTES.md for how the split was inferred, and confirm with
-- Signize before treating the seed as authoritative.
create type pricing_basis as enum ('direct', 'standin');

-- ---------------------------------------------------------------- §3 brands
create type brand_status as enum ('draft', 'confirmed', 'live', 'paused');

create type approval_mode as enum ('standard_model', 'always', 'never');

create type sla_action as enum ('remind', 'escalate', 'auto_forward');

-- Resolved per line item at package-send time: brand_items.vendor_policy_override
-- first, else brands.vendor_policy (SPEC §4). `corporate_first` routes the
-- package to corporate instead of a vendor; corporate forwards it manually.
create type vendor_policy as enum (
  'signage_com',
  'approved_vendor',
  'preferred_vendor',
  'corporate_first'
);

-- SPEC §3.2 calls this "extensible per brand" — extend with ALTER TYPE when a
-- brand needs a format beyond the pilot three.
create type location_format as enum ('inline', 'endcap', 'freestanding');

-- ---------------------------------------------------------------- §5 workflow
-- modify / remove / rebrand are v1.1: the values exist so the UI can stub them
-- exactly as docs/flow-demo.jsx does, but no flow builds them in MVP.
create type request_intent as enum (
  'initial_setup',
  'add',
  'replace_like',
  'modify',
  'remove',
  'rebrand'
);

-- SPEC §6. `needs_review` is skipped entirely when every item auto-approves
-- (the fast lane). The internal and external tails share these values; which
-- tail a request is on is a property of its quote (quotes.external).
create type request_status as enum (
  'draft',
  'submitted',
  'needs_review',
  'changes_requested',
  'approved',
  'sent_for_quote',
  'quote_ready',
  'accepted',
  'in_production',
  'shipped',
  'completed'
);

create type line_item_origin as enum ('standard', 'addon', 'exception', 'replacement');

-- SPEC §5.4 lists four values; `changes_requested` is the fifth because the
-- §6/§7 change-request loop reopens individual flagged items and the franchisee
-- status page renders a per-item callout for them (docs/flow-demo.jsx
-- ITEM_STATUS). Flagged in the session notes — spec §5.4 should gain the value.
create type line_item_status as enum (
  'auto_approved',
  'pending_review',
  'approved',
  'declined',
  'changes_requested'
);

create type installed_sign_status as enum ('active', 'removed');

create type replace_reason as enum ('damaged', 'worn', 'vandalized');

-- `landlord_criteria` is the §8b lease sign exhibit the franchisee uploads at
-- setup (TBD allowed — it never blocks submission).
create type request_file_kind as enum (
  'placement_photo',
  'site_file',
  'mockup',
  'package_pdf',
  'condition_photo',
  'landlord_criteria'
);

create type event_actor as enum ('franchisee', 'team', 'reviewer', 'corporate', 'system');

-- ---------------------------------------------------------------- §8c DID
create type did_imagery_source as enum ('upload', 'street_view', 'none');

create type did_fee_status as enum ('unpaid', 'paid');

-- HARD RULE (CLAUDE.md, SPEC §8c): `signed` is deliberately ABSENT. Auto-applying
-- an architect seal is plan stamping and is illegal in all 50 states. MVP ships
-- the unstamped intent tier only; the value is added — together with a
-- per-drawing architect action — if and only if the signed tier is approved.
-- Do not add it to make a code path compile.
create type did_signature_status as enum ('unsigned', 'intent_only');
