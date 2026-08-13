-- Two-layer catalog (SPEC §2) and brand configuration (SPEC §3).
--
-- master_catalog is Signage.com-owned and shared across every brand; brand_items
-- pin one master row's attributes into a named brand item. Franchisees only ever
-- see brand items.

-- ---------------------------------------------------------- §2.1 master_catalog
create table master_catalog (
  id                uuid primary key default gen_random_uuid(),
  placement         placement not null,
  category          text not null,
  sign_type         text not null,
  variant           text,
  -- Available options per attribute (mounting, material, paint_finish,
  -- fabricated_finish, return_color, trim_type, neon_color, lightbox_type,
  -- shape, char_height_band, ul_required, depth_range). Seeded from
  -- docs/sign-attribute-options.json.
  attribute_options jsonb not null default '{}'::jsonb,
  -- The canonical pricing-engine name — the exact string POST /sign-pricing
  -- expects in its `sign_type` field. Null on rows with no pricing model.
  pricing_type      text,
  pricing_basis     pricing_basis not null,
  -- The mockup engine's slug for POST /generate-mockup. A DIFFERENT vocabulary
  -- from pricing_type and not interchangeable with it: a row can render without
  -- being priceable (window vinyl) or be priceable without a renderer. See
  -- reference/design-studio/src/studio-bridge/renderKeyMap.js and
  -- docs/design-studio-findings.md §6.5.
  render_key        text,
  -- Engine finish token (e.g. `goldenMirror`) where the variant is a finish.
  fabricated_finish text,
  -- Upstream Signize node id, for re-syncing. NOT unique: the live taxonomy
  -- reuses ids across branches (docs/TAXONOMY-NOTES.md), so the natural key
  -- below is what identifies a row.
  source_id         integer,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Natural key. `variant` is empty for the six variant-less rows, so coalesce.
create unique index master_catalog_natural_key
  on master_catalog (placement, sign_type, coalesce(variant, ''));

create index master_catalog_active_idx on master_catalog (active) where active;

-- ----------------------------------------------------------------- §3.1 brands
create table brands (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  -- The asset used for ALL Design Studio generations. Franchisees never upload
  -- logos (SPEC §3.1).
  logo_url                 text,
  brand_colors             jsonb not null default '{}'::jsonb,
  status                   brand_status not null default 'draft',
  approval_mode            approval_mode not null default 'standard_model',
  reviewer_email           text,
  reviewer_email_secondary text,
  review_sla_days          integer not null default 5 check (review_sla_days > 0),
  sla_action               sla_action not null default 'remind',
  vendor_policy            vendor_policy not null default 'signage_com',
  vendor_name              text,
  vendor_email             text,
  -- CC corporate on routed packages, and where to send them.
  corporate_cc             boolean not null default true,
  corporate_email          text,
  -- Shown to franchisees for internal fulfillment, e.g. "14 working days".
  default_tat              text,
  -- §8c: brand-email magic-link auth validates the requester's domain against
  -- this list. Empty means DID access is not yet open for the brand.
  did_allowed_email_domains text[] not null default '{}',
  -- §8c fee, in cents. Null → fall back to the platform default in env. Kept a
  -- column rather than a constant because the amount is an open question
  -- (placeholder $499) and will differ per brand.
  did_fee_cents            integer check (did_fee_cents is null or did_fee_cents >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- An external policy is meaningless without somewhere to send the package.
  constraint brands_external_vendor_contact check (
    vendor_policy in ('signage_com', 'corporate_first')
    or (vendor_name is not null and vendor_email is not null)
  ),
  constraint brands_corporate_first_needs_email check (
    vendor_policy <> 'corporate_first' or corporate_email is not null
  ),
  constraint brands_corporate_cc_needs_email check (
    not corporate_cc or corporate_email is not null
  )
);

-- ------------------------------------------------------------ §2.2 brand_items
create table brand_items (
  id                     uuid primary key default gen_random_uuid(),
  brand_id               uuid not null references brands (id) on delete cascade,
  -- restrict: a master row backing a live brand item must not vanish.
  master_catalog_id      uuid not null references master_catalog (id) on delete restrict,
  name                   text not null,
  -- Corporate-locked choices, e.g.
  -- {"trim":"trimless","return_color":"match_logo","finish":"gloss","mounting":"standard_raceway","ul":true}
  pinned_attributes      jsonb not null default '{}'::jsonb,
  -- Which attributes stay per-site, e.g. {size, mounting}.
  site_variables         text[] not null default '{}',
  -- Human-readable pinned spec line, rendered in UI and emails verbatim.
  spec_summary           text,
  -- Estimate for direct-priced items. Null → "Custom quote", priced manually by
  -- the team. Must stay null whenever the master row is standin-priced.
  est_price              numeric(12, 2) check (est_price is null or est_price >= 0),
  thumbnail_url          text,
  -- Per-item override of the brand approval rules (SPEC §7).
  requires_review_override boolean,
  -- Per-item routing override (SPEC §4). Null → brand default.
  vendor_policy_override vendor_policy,
  active                 boolean not null default true,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint brand_items_name_unique unique (brand_id, name)
);

create index brand_items_brand_idx on brand_items (brand_id, sort_order);

-- --------------------------------------------------------- §3.2 brand_packages
create table brand_packages (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands (id) on delete cascade,
  format      location_format not null,
  label       text not null,
  description text,
  -- Ordered brand_item ids. Duplicates are meaningful, not a bug: an endcap
  -- takes 2× storefront letters because it has two elevations (SPEC §3.2).
  -- A jsonb array rather than a join table precisely so ordering and
  -- duplication survive.
  items       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint brand_packages_format_unique unique (brand_id, format),
  constraint brand_packages_items_is_array check (jsonb_typeof(items) = 'array')
);

-- ------------------------------------------------------------ team access list
-- SPEC §10: the Signage.com team authenticates through Supabase Auth and is
-- gated by this allowlist. Membership is granted out of band (seed or SQL), not
-- self-serve.
create table team_members (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- touch fn
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger brands_touch before update on brands
  for each row execute function app.touch_updated_at();
create trigger brand_items_touch before update on brand_items
  for each row execute function app.touch_updated_at();
create trigger brand_packages_touch before update on brand_packages
  for each row execute function app.touch_updated_at();
