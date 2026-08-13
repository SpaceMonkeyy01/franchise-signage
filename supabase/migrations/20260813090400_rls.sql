-- Access model (SPEC §10).
--
--   Franchisee  → anon role + a per-request access token. No account, no login.
--   Reviewer    → signed single-use expiring email links (verified server-side;
--                 the reviewer never gets a database identity).
--   Team        → Supabase Auth, gated by the team_members allowlist.
--   Corporate   → magic link, read-only (Session 6).
--   Vendor      → email only, never touches the database.
--
-- The token travels as an `x-access-token` request header, which PostgREST
-- exposes to policies. The application ALSO checks it, but RLS is the
-- enforcement: a bug in a route handler must not be able to leak another
-- location's record.
--
-- Mutations that cannot be token-scoped (minting the first request for a
-- location, writing request_events, sending mail) run server-side under the
-- service role, which bypasses RLS by design. Every such path is expected to
-- validate its own authorization — see src/lib/status/ for the transition
-- helper that owns the write side.

-- ------------------------------------------------------------------- helpers
-- The franchisee's presented token. Reads the PostgREST request header first,
-- then a session GUC so server-side code and tests can set it directly.
create or replace function app.access_token()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-access-token', ''),
    nullif(current_setting('app.access_token', true), '')
  );
$$;

-- True when the caller holds a token matching this request.
create or replace function app.owns_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from requests r
    where r.id = target_request_id
      and r.access_token = app.access_token()
      and app.access_token() is not null
  );
$$;

-- True when the caller is an authenticated Signage.com team member.
create or replace function app.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from team_members m
    where m.active
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------- role grants
grant usage on schema public to anon, authenticated;
grant execute on function app.access_token() to anon, authenticated;
grant execute on function app.owns_request(uuid) to anon, authenticated;
grant execute on function app.is_team_member() to anon, authenticated;

-- --------------------------------------------------------------- enable RLS
alter table master_catalog  enable row level security;
alter table brands          enable row level security;
alter table brand_items     enable row level security;
alter table brand_packages  enable row level security;
alter table team_members    enable row level security;
alter table locations       enable row level security;
alter table requests        enable row level security;
alter table line_items      enable row level security;
alter table request_files   enable row level security;
alter table installed_signs enable row level security;
alter table request_events  enable row level security;
alter table change_requests enable row level security;
alter table quotes          enable row level security;
alter table did_requests    enable row level security;
alter table franchisee_registrations enable row level security;

-- ------------------------------------------------------------- team: full read
-- The team queue spans every brand and every location, so team policies are
-- unscoped by design — membership in team_members IS the scope.
do $$
declare t text;
begin
  foreach t in array array[
    'master_catalog', 'brands', 'brand_items', 'brand_packages', 'team_members',
    'locations', 'requests', 'line_items', 'request_files', 'installed_signs',
    'request_events', 'change_requests', 'quotes', 'did_requests',
    'franchisee_registrations'
  ]
  loop
    execute format(
      'create policy team_all on %I for all to authenticated
         using (app.is_team_member()) with check (app.is_team_member())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end;
$$;

-- ------------------------------------------------------- catalog: public read
-- Franchisees browse the approved catalog before any token exists (the
-- co-branded entry page), so active catalog rows are readable by anon. Prices
-- and vendor chips live here and are meant to be seen; nothing else does.
create policy catalog_public_read on master_catalog
  for select to anon using (active);
create policy brand_items_public_read on brand_items
  for select to anon using (active);
create policy brand_packages_public_read on brand_packages
  for select to anon using (true);

grant select on master_catalog, brand_items, brand_packages to anon;

-- `brands` itself stays closed to anon: the row carries reviewer_email,
-- corporate_email and vendor_email, and RLS cannot filter columns. The
-- co-branded page reads this view instead, which runs as its owner and so
-- returns only the co-branding fields.
create view brands_public
with (security_invoker = false) as
  select id, name, slug, logo_url, brand_colors, status,
         vendor_policy, vendor_name, default_tat
  from brands
  where status in ('confirmed', 'live');

grant select on brands_public to anon, authenticated;

-- ------------------------------------------------- franchisee: token-scoped read
create policy requests_token_read on requests
  for select to anon
  using (access_token = app.access_token() and app.access_token() is not null);

-- A franchisee may correct their own request while it is still theirs to
-- correct. Advancing status is the server's job, not the browser's: the
-- transition helper runs under the service role.
create policy requests_token_update on requests
  for update to anon
  using (
    access_token = app.access_token()
    and app.access_token() is not null
    and status in ('draft', 'changes_requested')
  )
  with check (access_token = app.access_token());

create policy line_items_token_read on line_items
  for select to anon using (app.owns_request(request_id));

-- Resubmission after a change request edits the flagged items in place.
create policy line_items_token_write on line_items
  for update to anon
  using (app.owns_request(request_id) and item_status = 'changes_requested')
  with check (app.owns_request(request_id));

create policy line_items_token_insert on line_items
  for insert to anon with check (app.owns_request(request_id));

create policy request_files_token_read on request_files
  for select to anon using (app.owns_request(request_id));

-- Placement photos, condition photos, and the lease sign exhibit.
create policy request_files_token_insert on request_files
  for insert to anon with check (app.owns_request(request_id));

create policy request_events_token_read on request_events
  for select to anon using (app.owns_request(request_id));
-- No anon insert: the timeline is the audit trail behind every approval and
-- every lender document, and is written only by the transition helper.

create policy change_requests_token_read on change_requests
  for select to anon using (app.owns_request(request_id));

create policy quotes_token_read on quotes
  for select to anon using (app.owns_request(request_id));

-- Accepting a quote is the one status-bearing action a franchisee takes
-- directly, and only on the internal tail (SPEC §4).
create policy quotes_token_accept on quotes
  for update to anon
  using (app.owns_request(request_id) and not external and accepted_at is null)
  with check (app.owns_request(request_id));

-- The location and its installed-sign record are visible to whoever holds a
-- token for any request against that location — that is what "your locations"
-- means when there are no accounts.
create policy locations_token_read on locations
  for select to anon
  using (exists (
    select 1 from requests r
    where r.location_id = locations.id
      and r.access_token = app.access_token()
      and app.access_token() is not null
  ));

create policy installed_signs_token_read on installed_signs
  for select to anon
  using (exists (
    select 1 from requests r
    where r.location_id = installed_signs.location_id
      and r.access_token = app.access_token()
      and app.access_token() is not null
  ));

grant select, update on requests to anon;
grant select, insert, update on line_items to anon;
grant select, insert on request_files to anon;
grant select on request_events, change_requests, locations, installed_signs to anon;
grant select, update on quotes to anon;

-- ------------------------------------------------------------------ §8c DIDs
-- DID access is brand-email magic link, not a request token: there is no
-- request and no location yet. Authorization is therefore resolved server-side
-- at magic-link verification, and anon gets no direct reach into these tables.
-- Policies exist so the tables are locked rather than merely un-granted.
create policy did_requests_no_anon on did_requests for select to anon using (false);
create policy franchisee_registrations_no_anon on franchisee_registrations
  for select to anon using (false);
