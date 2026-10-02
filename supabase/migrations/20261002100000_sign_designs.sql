-- Signs designed in the Design Studio (SPEC v2.6 §8, DECISIONS #166).
--
-- A brand admin designs a brand sign (logo, options, size) and says what a
-- franchisee may change; a franchisee's adjusted design rides on the line
-- item. The engine's price, with Signage.com's margin, becomes the sign's
-- est_price — so where a number came from is recorded beside it.
--
-- Signize's COST is not stored on either row: brand roles can read
-- brand_items, and cost beside price would show them the margin. It lives in
-- engine_quotes, which only the team can read.

alter table brand_items
  -- { logo, options, dimension: { axis, inches }, depthInches, mockupPath,
  --   price, turnaroundDays, widthInches, heightInches, pricedAt } — no cost.
  add column design jsonb,
  -- Per setting: { "mode": "locked" } | { "mode": "choices", "values": [...] }
  --   | { "mode": "range", "min": n, "max": n }. A setting not listed is locked.
  add column design_rules jsonb not null default '{}'::jsonb,
  add column price_source text not null default 'team' check (price_source in ('team', 'engine'));

alter table line_items
  -- The franchisee's design, same shape as brand_items.design.
  add column design jsonb,
  add column price_source text check (price_source in ('team', 'engine'));

create table engine_quotes (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands (id) on delete cascade,
  brand_item_id   uuid references brand_items (id) on delete set null,
  line_item_id    uuid references line_items (id) on delete set null,
  sign_type       text not null,
  cost            numeric(10, 2) not null,
  margin_percent  numeric(5, 2) not null,
  price           numeric(10, 2) not null,
  turnaround_days integer,
  -- Signize's own reference for the quote, for a conversation with them.
  quotation_id    text,
  created_at      timestamptz not null default now()
);

create index engine_quotes_item_idx on engine_quotes (brand_item_id, created_at desc);

alter table engine_quotes enable row level security;

create policy team_all on engine_quotes
  for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

grant select, insert, update, delete on engine_quotes to authenticated;
