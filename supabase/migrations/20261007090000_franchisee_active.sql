-- A franchisee company can be switched off as a whole (DECISIONS #200).
--
-- When a franchise ends, Signage.com deactivates the company: everyone in it
-- (owners and store staff) loses access at once, and each person's own
-- active/inactive state is kept, so reactivating the company restores exactly
-- who had access before. The stores and their installed signs stay: they are
-- permanent location records, not the company's.
--
-- Additive: two columns, and the three access functions re-declared with one
-- more condition — a franchisee role counts only while its company is active.

alter table franchisees add column active boolean not null default true;
alter table franchisees add column deactivated_at timestamptz;

-- True for a membership with no company, or one whose company is active.
create or replace function app.franchisee_active(target_franchisee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_franchisee_id is null or exists (
    select 1 from franchisees f where f.id = target_franchisee_id and f.active
  );
$$;

create or replace function app.brand_role(target_brand_id uuid)
returns member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when app.is_platform_admin() then 'platform_admin'::member_role
    else (
      select min(m.role) from memberships m
       where m.profile_id = app.current_profile()
         and m.brand_id = target_brand_id
         and m.active
         and app.franchisee_active(m.franchisee_id)
    )
  end;
$$;

create or replace function app.can_see_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_platform_admin() or exists (
    select 1
      from locations l
      join memberships m on m.brand_id = l.brand_id
     where l.id = target_location_id
       and m.profile_id = app.current_profile()
       and m.active
       and app.franchisee_active(m.franchisee_id)
       and (
         m.role in ('brand_admin', 'brand_reviewer')
         or (m.role = 'franchisee_owner' and m.franchisee_id = l.franchisee_id)
         or (m.role = 'franchisee_staff' and m.franchisee_id = l.franchisee_id and exists (
               select 1 from membership_locations ml
                where ml.membership_id = m.id and ml.location_id = l.id))
       )
  );
$$;

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
       and app.franchisee_active(m.franchisee_id)
  );
$$;

grant execute on function app.franchisee_active(uuid) to anon, authenticated;
