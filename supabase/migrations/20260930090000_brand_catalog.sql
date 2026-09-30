-- The catalog, managed in the app (SPEC v2.4 §2.3).
--
-- Additive. Every existing brand item is `approved`; a brand admin's proposal
-- arrives `pending` AND inactive, so every query that already filters on
-- `active` — the franchisee catalog, request creation, packages, the budget
-- numbers, anon reads — keeps it out of sight until the team approves it.

create type brand_item_review as enum ('pending', 'approved', 'declined');

alter table brand_items
  add column review_status   brand_item_review not null default 'approved',
  add column submitted_by    uuid references memberships (id) on delete set null,
  add column submitted_at    timestamptz,
  -- The brand admin's words: what the sign is for, where it goes, sizes.
  add column submission_note text,
  add column reviewed_by     uuid references memberships (id) on delete set null,
  add column reviewed_at     timestamptz,
  -- Why it was declined, or what the team changed on approval.
  add column review_note     text,
  -- Only an approved sign can be live.
  add constraint brand_items_live_is_approved check (review_status = 'approved' or not active);

create index brand_items_pending_idx on brand_items (submitted_at) where review_status = 'pending';

-- Append-only, like request_events: what changed in a catalog, by whom.
-- brand_id null = the master catalog.
create table catalog_events (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid references brands (id) on delete cascade,
  brand_item_id       uuid references brand_items (id) on delete set null,
  master_catalog_id   uuid references master_catalog (id) on delete set null,
  kind                text not null,
  actor_membership_id uuid references memberships (id) on delete set null,
  -- Who, as a person reads it: kept so the line survives a deleted membership.
  actor_label         text not null,
  summary             text not null,
  detail              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index catalog_events_brand_idx on catalog_events (brand_id, created_at desc);

-- ---------------------------------------------------------------------- RLS
-- The app reaches Postgres as the owner and checks roles itself; these
-- policies are the same rules for any client that reaches the tables through
-- Supabase, as elsewhere in the build.

alter table catalog_events enable row level security;

create policy team_all on catalog_events
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

create policy catalog_events_brand_read on catalog_events
  for select to authenticated
  using (brand_id is not null and app.brand_role(brand_id) in ('brand_admin', 'brand_reviewer'));

grant select, insert, update, delete on catalog_events to authenticated;

-- A brand's admins and reviewers see every one of its signs, pending and
-- retired included, and its packages.
create policy brand_items_brand_read on brand_items
  for select to authenticated
  using (app.brand_role(brand_id) in ('brand_admin', 'brand_reviewer'));

create policy brand_packages_brand_read on brand_packages
  for select to authenticated
  using (app.brand_role(brand_id) in ('brand_admin', 'brand_reviewer'));

-- A brand admin proposes: a new row only as pending and inactive, with no price.
create policy brand_items_brand_admin_propose on brand_items
  for insert to authenticated
  with check (
    app.brand_role(brand_id) = 'brand_admin'
    and review_status = 'pending' and not active and est_price is null
  );

-- A brand admin edits packages, live at once (§2.3).
create policy brand_packages_brand_admin_update on brand_packages
  for update to authenticated
  using (app.brand_role(brand_id) = 'brand_admin')
  with check (app.brand_role(brand_id) = 'brand_admin');
