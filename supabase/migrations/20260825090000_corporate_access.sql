-- The corporate dashboard's credential (SPEC §10, §9 interface 6).
--
-- "Corporate dashboard: magic link" is the whole of what §10 says, so the shape
-- comes from what the dashboard IS: a standing, read-only view of a brand's
-- whole signage program, opened by whoever at the franchisor is responsible for
-- it. That differs from the reviewer's link (`review_links`) on every axis that
-- matters, and the two are deliberately separate tables rather than one with a
-- mode column:
--
--   · scope       — a brand, not a request;
--   · lifetime    — 30 days of a working bookmark, not 7 days to decide;
--   · uses        — many, not one; reading is not an act;
--   · revocation  — never on package version, because it approves nothing.
--
-- The last line is the important one. A reviewer's link is a signed authority to
-- decide, and everything about it is built to make that authority narrow. This
-- link authorises READING, and giving it decision power would quietly widen the
-- approval credential §10 was careful about. The dashboard therefore shows the
-- approvals view and cannot act from it (DECISIONS #75).

create table corporate_links (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands (id) on delete cascade,
  -- Who asked. Only an address already configured on the brand can be issued
  -- one, so this is a record of which of them is actually using it.
  email        text not null,
  -- Stored hashed for the same reason review links are: a database dump should
  -- not be a set of working credentials.
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  -- Stamped on each successful open. The team's only way to answer "is
  -- corporate actually looking at this?" without asking them.
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create index corporate_links_brand_idx on corporate_links (brand_id);
create index corporate_links_hash_idx on corporate_links (token_hash);

-- ------------------------------------------------------------------- §10 RLS
-- The presented token travels in the same `x-access-token` header a franchisee's
-- does: a caller presents one credential, and the tables that recognise it
-- decide what it reaches. `app.access_token()` already reads that header, so
-- this helper only has to answer the second question — which brand, if any, does
-- the presented token open?
-- `extensions` is in the search_path because `digest()` lives there on Supabase,
-- which installs pgcrypto into its own schema; `create extension pgcrypto` with
-- no schema puts it in `public`, which is where the dev database has it. Pinning
-- the search_path on a security-definer function is right and stays — so the
-- path names both, and Postgres ignores whichever schema is absent. This is the
-- only function here that calls into an extension: the other two pinned ones
-- reach `auth.jwt()`, which is qualified at the call site.
create or replace function app.corporate_brand()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select l.brand_id
    from corporate_links l
   where l.token_hash = encode(digest(app.access_token(), 'sha256'), 'hex')
     and app.access_token() is not null
     and l.revoked_at is null
     and l.expires_at > now()
   limit 1;
$$;

grant execute on function app.corporate_brand() to anon, authenticated;

alter table corporate_links enable row level security;

-- The link row itself is never read by anon: it is resolved server-side, and a
-- policy that let a token read its own row would leak nothing useful and invite
-- enumeration of the rest.
create policy corporate_links_no_anon on corporate_links for select to anon using (false);

create policy corporate_links_team_all on corporate_links
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());
grant select, insert, update, delete on corporate_links to authenticated;

-- --------------------------------------------------- brand-scoped read for anon
-- Read only, and only within the brand the token opens. These sit alongside the
-- franchisee's token policies rather than replacing them: permissive policies
-- are OR'd, so a location is visible to a franchisee holding a request token for
-- it OR to corporate holding a link for its brand.
create policy locations_corporate_read on locations
  for select to anon using (brand_id = app.corporate_brand());

create policy requests_corporate_read on requests
  for select to anon using (brand_id = app.corporate_brand());

create policy line_items_corporate_read on line_items
  for select to anon
  using (exists (
    select 1 from requests r
    where r.id = line_items.request_id and r.brand_id = app.corporate_brand()
  ));

create policy quotes_corporate_read on quotes
  for select to anon
  using (exists (
    select 1 from requests r
    where r.id = quotes.request_id and r.brand_id = app.corporate_brand()
  ));

create policy installed_signs_corporate_read on installed_signs
  for select to anon
  using (exists (
    select 1 from locations l
    where l.id = installed_signs.location_id and l.brand_id = app.corporate_brand()
  ));

create policy request_events_corporate_read on request_events
  for select to anon
  using (exists (
    select 1 from requests r
    where r.id = request_events.request_id and r.brand_id = app.corporate_brand()
  ));

create policy request_files_corporate_read on request_files
  for select to anon
  using (exists (
    select 1 from requests r
    where r.id = request_files.request_id and r.brand_id = app.corporate_brand()
  ));

-- §8d level 1 is corporate's own act — they register the franchisee. The write
-- runs server-side like every other mutation, but the list they are looking at
-- is theirs to see.
create policy franchisee_registrations_corporate_read on franchisee_registrations
  for select to anon using (brand_id = app.corporate_brand());

-- ------------------------------------------------------- the vendor-policy card
-- `brands` stays closed to anon (it carries three contact addresses and RLS
-- cannot filter columns), so the dashboard's vendor-policy card reads the view.
-- `corporate_cc` is added to it: whether packages copy corporate is a fact about
-- the brand's own policy, shown to the franchisee already in the routing note,
-- and not an address.
create or replace view brands_public
with (security_invoker = false) as
  select id, name, slug, logo_url, brand_colors, status,
         vendor_policy, vendor_name, default_tat, corporate_cc
  from brands
  where status in ('confirmed', 'live');

grant select on brands_public to anon, authenticated;
