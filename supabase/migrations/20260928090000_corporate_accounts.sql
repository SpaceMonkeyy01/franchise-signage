-- Corporate in-app (SPEC v2.3 §10, phase C of §9b).
--
-- Brand admins and reviewers sign in. Three things follow in the schema:
--
--   1. A decision can now arrive two ways — the reviewer's emailed link, or a
--      signed-in session on the dashboard — and both write the same rows
--      (§10.3.4). The line item records which way, and who.
--   2. `corporate_links` retires (§10.3.4). The table stays, read-only, and is
--      dropped one release after this has run in production (§10.5); what ends
--      today is its power to open anything.
--   3. The brand's own people read what their dashboard shows, through the
--      same helpers every other §10 policy is written against.
--
-- Additive, like every migration in this build.

-- ------------------------------------------------------- who decided, and how
-- `reviewed_via_token` (the link's id) stays as it was. These two say who, and
-- by which route — `link` or `session` — so the audit trail behind an approval
-- names a person on either path.
alter table line_items
  add column reviewed_by_email text,
  add column reviewed_by uuid references profiles (id),
  add column reviewed_route text
    constraint line_items_reviewed_route check (reviewed_route in ('link', 'session'));

-- ------------------------------------------------------ corporate_links retire
-- Every live link stops working now, and the helper that let one read a brand's
-- program through PostgREST answers "no brand" from here on. Redefined rather
-- than dropped, for the reason app.is_team_member() was: every policy that
-- calls it goes quiet at once, and nothing has to be re-created.
update corporate_links set revoked_at = now() where revoked_at is null;

create or replace function app.corporate_brand()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select null::uuid;
$$;

-- ------------------------------------------------------------------- §10 RLS
-- Reads only. Every corporate write — a decision, an invitation, a
-- deactivation — runs server-side and checks the membership itself; these are
-- the backstop, as in phase B.

-- §8d level 1: the brand's registrations, for its admins and reviewers.
create policy franchisee_registrations_brand_read on franchisee_registrations
  for select to authenticated
  using (app.brand_role(brand_id) in ('brand_admin', 'brand_reviewer'));

-- The brand's people, for the brand admin who manages them (§10.2).
create policy memberships_brand_admin_read on memberships
  for select to authenticated
  using (brand_id is not null and app.brand_role(brand_id) = 'brand_admin');

create policy invitations_brand_admin_read on invitations
  for select to authenticated
  using (brand_id is not null and app.brand_role(brand_id) = 'brand_admin');

-- A brand admin sees the profiles of people who hold a role on their brand —
-- the name and address on the People list, and nothing else of anyone else's.
create policy profiles_brand_admin_read on profiles
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.profile_id = profiles.id
       and m.brand_id is not null
       and app.brand_role(m.brand_id) = 'brand_admin'
  ));
