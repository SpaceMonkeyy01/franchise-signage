-- Concept Drawings Generator (SPEC §8c) — the parallel track.
--
-- Built in Session 8, gated on corporate template sign-off and a Stripe account.
-- The table lands now so nothing later needs a destructive migration.
--
-- did_requests is DECOUPLED FROM locations on purpose. Franchisees run DIDs
-- while site hunting, often against two or three candidate addresses, and only
-- one becomes real. Several rows per requester_email is normal use, not an edge
-- case: do not dedupe, do not warn. location_id is filled in later, if ever,
-- when a paid DID converts into a real location.

create table did_requests (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references brands (id) on delete cascade,
  -- Validated against brands.did_allowed_email_domains at magic-link time.
  requester_email  text not null,
  -- The CANDIDATE SITE, not "your location" — that framing is a copy
  -- requirement in SPEC §8c, and it is the reason this table has no location FK
  -- at creation time.
  address          jsonb not null default '{}'::jsonb,
  zip              text,
  area_sqft        numeric(12, 2) check (area_sqft is null or area_sqft > 0),
  -- upload → franchisee's storefront photo; street_view → Google imagery for the
  -- address; none → the graceful-degradation path, a generic elevation for the
  -- format ("upload a photo or we proceed with a generic elevation").
  imagery_source   did_imagery_source not null default 'none',
  format_inference location_format,
  -- Storage paths for the generated sheet(s). Plain paths rather than FKs into
  -- request_files because a DID has no request — it exists before any location.
  drawing_file_ids text[] not null default '{}',
  estimate_total   numeric(12, 2) check (estimate_total is null or estimate_total >= 0),
  fee_status       did_fee_status not null default 'unpaid',
  -- Amount actually charged, in cents, resolved from brands.did_fee_cents or the
  -- platform default at checkout time. Recorded so a later price change never
  -- rewrites history.
  fee_cents        integer check (fee_cents is null or fee_cents >= 0),
  payment_ref      text,
  -- HARD RULE (CLAUDE.md, SPEC §8c): the enum has no `signed` value, so no code
  -- path can reach it. An architect seal requires a per-drawing architect
  -- action; auto-applying one is plan stamping and illegal in all 50 states.
  signature_status did_signature_status not null default 'unsigned',
  signed_at        timestamptz,
  -- Set when the franchisee proceeds to real setup: the DID becomes the first
  -- document in the location record and prefills address / format / photos.
  location_id      uuid references locations (id) on delete set null,
  converted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Only a paid DID converts.
  constraint did_requests_conversion_is_paid check (
    location_id is null or fee_status = 'paid'
  ),
  constraint did_requests_converted_at check (
    (location_id is null) = (converted_at is null)
  )
);

create index did_requests_brand_idx on did_requests (brand_id, created_at desc);
create index did_requests_email_idx on did_requests (requester_email);
-- The funnel metric for the feature: DID-to-location conversion rate.
create index did_requests_conversion_idx on did_requests (brand_id) where location_id is not null;

create trigger did_requests_touch before update on did_requests
  for each row execute function app.touch_updated_at();

-- §8d level 1: corporate registers a franchisee's brand email at agreement
-- signing, which fires the welcome email and opens DID access. This is the only
-- franchisee identity that exists before a lease.
create table franchisee_registrations (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands (id) on delete cascade,
  email             text not null,
  name              text,
  registered_by     event_actor not null default 'corporate',
  welcome_sent_at   timestamptz,
  created_at        timestamptz not null default now(),

  constraint franchisee_registrations_unique unique (brand_id, email)
);
