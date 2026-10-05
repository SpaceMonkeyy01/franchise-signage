-- Where a sign type's price comes from, chosen by the team (DECISIONS #179):
--
--   studio  the Design Studio engine prices each design (cost / (1 - margin))
--   fixed   Signage.com sets each brand sign's price by hand (est_price); the
--           Studio still draws the sign
--   custom  priced per order by the team ("Custom quote", SPEC §2.1)
--
-- pricing_basis stays, in step: custom is `standin`, the other two `direct`,
-- so everything that reads "is this a custom quote?" keeps working. A row
-- inserted without a price_mode (the seed, older scripts) takes it from its
-- pricing_basis.

alter table master_catalog add column price_mode text;

update master_catalog
   set price_mode = case when pricing_basis = 'standin' then 'custom' else 'studio' end;

create or replace function app.default_price_mode()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.price_mode is null then
    new.price_mode := case when new.pricing_basis = 'standin' then 'custom' else 'studio' end;
  end if;
  return new;
end;
$$;

create trigger master_catalog_default_price_mode before insert or update on master_catalog
  for each row execute function app.default_price_mode();

alter table master_catalog
  alter column price_mode set not null,
  add constraint master_catalog_price_mode_check check (price_mode in ('studio', 'fixed', 'custom')),
  add constraint master_catalog_price_mode_basis check ((price_mode = 'custom') = (pricing_basis = 'standin'));
