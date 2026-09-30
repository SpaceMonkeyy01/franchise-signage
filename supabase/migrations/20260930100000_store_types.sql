-- Store types, defined per brand (SPEC v2.4 §3.2, DECISIONS #156).
--
-- `location_format` was a fixed enum — inline, endcap, freestanding — for
-- every brand. A brand now defines its own ("Drive-thru", "Mall in-line"), each
-- with its standard package. The two columns that used the enum become text
-- keys into this table, and a composite foreign key keeps a store or package
-- from naming a type its brand does not have. Existing values are the keys of
-- the three default types every brand starts with, so no row changes.
--
-- The enum type itself is left in place, unused: dropping it gains nothing
-- and a migration history reads better without the removal.

create table brand_store_types (
  brand_id    uuid not null references brands (id) on delete cascade,
  -- Stable key, e.g. `drive_thru`: stored on locations and packages, and used
  -- in document URLs. The label is what people read and can change.
  key         text not null check (key ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
  label       text not null,
  description text,
  sort_order  integer not null default 0,
  -- Retired: no new store can be set up as it; stores that are keep it.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (brand_id, key)
);

create trigger brand_store_types_touch before update on brand_store_types
  for each row execute function app.touch_updated_at();

-- Every brand starts with the three the product was built around.
create or replace function app.default_store_types()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into brand_store_types (brand_id, key, label, description, sort_order)
  values (new.id, 'inline', 'Inline', 'A unit within a strip center: one storefront', 1),
         (new.id, 'endcap', 'Endcap', 'The end unit of a strip: two elevations', 2),
         (new.id, 'freestanding', 'Freestanding', 'A standalone building on its own lot', 3)
  on conflict do nothing;
  return new;
end;
$$;

create trigger brands_default_store_types after insert on brands
  for each row execute function app.default_store_types();

insert into brand_store_types (brand_id, key, label, description, sort_order)
select b.id, t.key, t.label, t.description, t.sort_order
  from brands b
 cross join (values ('inline', 'Inline', 'A unit within a strip center: one storefront', 1),
                    ('endcap', 'Endcap', 'The end unit of a strip: two elevations', 2),
                    ('freestanding', 'Freestanding', 'A standalone building on its own lot', 3))
       as t (key, label, description, sort_order);

alter table locations alter column format type text using format::text;
alter table brand_packages alter column format type text using format::text;
alter table did_requests alter column format_inference type text using format_inference::text;

alter table locations
  add constraint locations_store_type_fk foreign key (brand_id, format)
  references brand_store_types (brand_id, key);
alter table brand_packages
  add constraint brand_packages_store_type_fk foreign key (brand_id, format)
  references brand_store_types (brand_id, key) on delete cascade;

-- ---------------------------------------------------------------------- RLS
alter table brand_store_types enable row level security;

create policy team_all on brand_store_types
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

-- Store types are not secret: the setup screen and the budget sheets show them.
create policy brand_store_types_public_read on brand_store_types
  for select to anon using (active);
create policy brand_store_types_member_read on brand_store_types
  for select to authenticated using (app.brand_role(brand_id) is not null);

create policy brand_store_types_brand_admin_insert on brand_store_types
  for insert to authenticated with check (app.brand_role(brand_id) = 'brand_admin');
create policy brand_store_types_brand_admin_update on brand_store_types
  for update to authenticated
  using (app.brand_role(brand_id) = 'brand_admin')
  with check (app.brand_role(brand_id) = 'brand_admin');

-- A brand admin creates the package for a new store type (updates were
-- granted in 20260930090000_brand_catalog.sql).
create policy brand_packages_brand_admin_insert on brand_packages
  for insert to authenticated with check (app.brand_role(brand_id) = 'brand_admin');

grant select on brand_store_types to anon;
grant select, insert, update, delete on brand_store_types to authenticated;
