-- Franchisee accounts (SPEC v2.3 §10, phase B of §9b).
--
-- Phase A laid down the model and the two helpers; this is the first phase to
-- let a signed-in person who is NOT Signage.com read workflow rows. Every policy
-- below is written against app.can_see_location(), which already answers for
-- owners, assigned staff and the brand's own admins and reviewers — so the same
-- policies serve phase C without change.
--
-- Read-only, all of them. A franchisee's writes (a new store, a request, an
-- accepted quote) run server-side and check the membership themselves, as every
-- write in this build does; these policies are the backstop for reads.

-- §8d: the registration stays as the record of the event and points to the
-- invitation it produced (SPEC v2.3 §10.3.1).
alter table franchisee_registrations
  add column invitation_id uuid references invitations (id) on delete set null;

-- ------------------------------------------------------------------- §10 RLS
create policy locations_member_read on locations
  for select to authenticated using (app.can_see_location(id));

create policy installed_signs_member_read on installed_signs
  for select to authenticated using (app.can_see_location(location_id));

create policy requests_member_read on requests
  for select to authenticated using (app.can_see_location(location_id));

create policy line_items_member_read on line_items
  for select to authenticated
  using (exists (
    select 1 from requests r
     where r.id = line_items.request_id and app.can_see_location(r.location_id)
  ));

create policy quotes_member_read on quotes
  for select to authenticated
  using (exists (
    select 1 from requests r
     where r.id = quotes.request_id and app.can_see_location(r.location_id)
  ));

create policy request_events_member_read on request_events
  for select to authenticated
  using (exists (
    select 1 from requests r
     where r.id = request_events.request_id and app.can_see_location(r.location_id)
  ));

create policy request_files_member_read on request_files
  for select to authenticated
  using (exists (
    select 1 from requests r
     where r.id = request_files.request_id and app.can_see_location(r.location_id)
  ));

create policy change_requests_member_read on change_requests
  for select to authenticated
  using (exists (
    select 1 from requests r
     where r.id = change_requests.request_id and app.can_see_location(r.location_id)
  ));

-- A person reads the franchisee company they belong to.
create policy franchisees_member_read on franchisees
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.profile_id = app.current_profile() and m.active
       and m.franchisee_id = franchisees.id
  ));
