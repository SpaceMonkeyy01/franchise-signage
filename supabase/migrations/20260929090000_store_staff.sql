-- Store staff (SPEC v2.3 §10, phase D of §9b).
--
-- `franchisee_staff` and its store scope have been in the model since phase A
-- (§10.7 D2), and app.can_see_location() already answers "only the stores they
-- are assigned". What phase D adds is the owner's side: the owner of a
-- franchisee company invites staff, chooses their stores, and deactivates them
-- (§10.2 "own stores"). That needs the owner to READ their company's people;
-- every write runs server-side and checks the membership itself, as in B and C.

-- Whether the caller owns a franchisee company, through an active membership.
create or replace function app.owns_franchisee(target_franchisee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = app.current_profile()
       and m.role = 'franchisee_owner'
       and m.franchisee_id = target_franchisee_id
       and m.active
  );
$$;

grant execute on function app.owns_franchisee(uuid) to anon, authenticated;

-- ------------------------------------------------------------------- §10 RLS
-- The company's staff, their store assignments and their open invitations.
create policy memberships_owner_read on memberships
  for select to authenticated
  using (role = 'franchisee_staff' and app.owns_franchisee(franchisee_id));

create policy membership_locations_owner_read on membership_locations
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.id = membership_locations.membership_id
       and m.role = 'franchisee_staff'
       and app.owns_franchisee(m.franchisee_id)
  ));

-- A staff member reads their own assignments, which is what scopes their home.
create policy membership_locations_self_read on membership_locations
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.id = membership_locations.membership_id
       and m.profile_id = app.current_profile()
  ));

create policy invitations_owner_read on invitations
  for select to authenticated
  using (role = 'franchisee_staff' and app.owns_franchisee(franchisee_id));

create policy profiles_owner_read on profiles
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.profile_id = profiles.id
       and m.role = 'franchisee_staff'
       and app.owns_franchisee(m.franchisee_id)
  ));

-- A brand admin manages every franchisee company's people (§10.2 "invite or
-- deactivate store staff: brand_admin ✓", DECISIONS #140). Phase C already lets
-- them read the brand's memberships, invitations and profiles; what the
-- corporate People tab adds is the companies themselves and staff store scopes.
create policy franchisees_brand_admin_read on franchisees
  for select to authenticated
  using (app.brand_role(brand_id) = 'brand_admin');

create policy membership_locations_brand_admin_read on membership_locations
  for select to authenticated
  using (exists (
    select 1 from memberships m
     where m.id = membership_locations.membership_id
       and m.brand_id is not null
       and app.brand_role(m.brand_id) = 'brand_admin'
  ));
