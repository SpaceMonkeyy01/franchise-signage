-- Platform settings the team keeps from the console rather than the host's
-- environment (DECISIONS #183). First use: the Design Studio engine's session
-- token, which expires and is renewed by pasting a new one on /admin/pricing
-- instead of redeploying. An environment variable, when set, still wins.
--
-- Team only, and a value is never sent back to a page: the console shows
-- whether a setting is present, when it was saved and by whom.

create table app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null
);

alter table app_settings enable row level security;

create policy team_all on app_settings
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

grant select, insert, update, delete on app_settings to authenticated;
