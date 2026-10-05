-- Changes to a store's own details (DECISIONS #177): name, address, opening
-- date and store type, with who made each change. Requests keep their own
-- timeline in request_events; this is the store's, which has none otherwise.
--
-- Store type decides which signs are standard and auto-approve (SPEC §7), so
-- a change to it is the one worth a trail: an owner may change it only before
-- the store's first order, Signage.com at any time.

create table location_events (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references locations (id) on delete cascade,
  actor_profile_id  uuid references profiles (id) on delete set null,
  -- Who, as a person reads it: kept so the line survives a deleted profile.
  actor_label       text not null,
  summary           text not null,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index location_events_location_idx on location_events (location_id, created_at desc);

-- The app reaches Postgres as the owner and checks roles itself; these are
-- the same rules for any client that reaches the table through Supabase.
alter table location_events enable row level security;

create policy team_all on location_events
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

create policy location_events_member_read on location_events
  for select to authenticated using (app.can_see_location(location_id));

grant select, insert, update, delete on location_events to authenticated;
