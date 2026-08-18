-- Per-policy vendor contacts (SPEC §3.1 / §4; docs/DECISIONS.md #20).
--
-- `brands` carries exactly ONE vendor_name/vendor_email, but §4 resolves routing
-- per ITEM: `brand_items.vendor_policy_override ?? brands.vendor_policy`. So a
-- brand on `signage_com` that overrides one item to `approved_vendor` — the
-- Freshbites pylon, the seeded case that exists to prove the split — produces a
-- second package with nowhere of its own to go. Until now it silently fell back
-- to the brand's only vendor address. That was survivable while nothing was
-- mailed; Session 5 mails it.
--
-- One row per (brand, policy). The brand columns stay as the contact for the
-- brand's OWN policy, so nothing already configured has to move.

create table brand_vendor_contacts (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands (id) on delete cascade,
  policy       vendor_policy not null,
  vendor_name  text not null,
  vendor_email text not null,
  -- Overrides brands.corporate_cc for packages to this recipient. Null → follow
  -- the brand. A brand may well want corporate copied on an outside vendor's
  -- package but not on Signage.com's own.
  corporate_cc boolean,
  -- Overrides brands.default_tat for this recipient, where one is known.
  tat          text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A brand cannot have two addresses for the same policy: routing groups by
  -- policy, so a second row would make the recipient ambiguous.
  constraint brand_vendor_contacts_one_per_policy unique (brand_id, policy)
);

create trigger brand_vendor_contacts_touch
  before update on brand_vendor_contacts
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------- §10 RLS
-- Contact addresses are configuration, not catalog: the team reads and writes
-- them, franchisees never see them. The vendor chip a franchisee does see comes
-- from brands_public.vendor_name, which is unchanged.
alter table brand_vendor_contacts enable row level security;

create policy team_all on brand_vendor_contacts for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

grant select, insert, update, delete on brand_vendor_contacts to authenticated;

create policy brand_vendor_contacts_no_anon on brand_vendor_contacts
  for select to anon using (false);

-- ------------------------------------------------------------------- quotes
-- Who the package was addressed to, captured at send time. Kept on the quote
-- rather than read back through the contact, for the same reason
-- review_links.reviewer_email is: a contact can be edited or deleted, and the
-- record of who was actually sent this package must not change with it.
alter table quotes add column recipient_name text;
