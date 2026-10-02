-- Signage.com's margin on the Design Studio engine's cost (SPEC v2.6 §8,
-- DECISIONS #165). The engine returns Signize's cost; Signage.com's price is
-- cost / (1 - margin). Set by the team per brand and per sign type, with a
-- brand default and one platform default beneath them:
--
--   (brand, sign type)  →  (brand, any type)  →  (any brand, any type)
--
-- `sign_type` is master_catalog.sign_type (e.g. "Illuminated Channel Letters"),
-- the level the engine prices at; every variant of a type shares its margin.
-- A brand never sees this table: no brand role has a policy on it, and changes
-- are logged to catalog_events with no brand_id, which brand roles cannot read.

create table pricing_margins (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid references brands (id) on delete cascade,
  sign_type       text,
  margin_percent  numeric(5, 2) not null check (margin_percent >= 0 and margin_percent < 100),
  updated_at      timestamptz not null default now(),
  -- A sign-type margin always belongs to a brand: the platform has one default.
  check (sign_type is null or brand_id is not null)
);

-- One row per (brand, sign type), counting "none" as a value, so there is
-- exactly one platform default and one default per brand.
create unique index pricing_margins_scope_idx
  on pricing_margins (coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(sign_type, ''));

-- The standard value until the team sets its own (2 Oct 2026: "give them a
-- standard value for now").
insert into pricing_margins (brand_id, sign_type, margin_percent) values (null, null, 40);

alter table pricing_margins enable row level security;

create policy team_all on pricing_margins
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

grant select, insert, update, delete on pricing_margins to authenticated;
