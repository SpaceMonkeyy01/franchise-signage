-- Accounts (SPEC v2.3 §10, phase A of §9b).
--
-- v2.2 had exactly one kind of signed-in person — the Signage.com team, gated by
-- the `team_members` allowlist — and credentials (tokens) for everyone else.
-- v2.3 gives everyone but vendors an account, created only by invitation, with a
-- ROLE ON A BRAND deciding what they can see and do. This migration lays down the
-- whole of that model at once, because the expensive thing to change later is
-- the shape (§10.7 D2): who owns a store, and how a person relates to a brand.
-- Phase A only USES the platform_admin role; the rest exist so phases B–D add
-- screens, not schema.
--
-- The identity itself — the email and password — lives in Supabase Auth
-- (`auth.users`), never here. `profiles.id` IS the auth user's id, and the only
-- credential-shaped things in this schema are hashed, single-use tokens: the
-- invitation that creates an account, and the reset that replaces a password.
--
-- Additive: nothing is dropped. `team_members` stops deciding anything (see
-- app.is_team_member below) and stays readable until a later release removes it.

-- ---------------------------------------------------------------------- roles
-- Declared most-powerful first, so `min(role)` over a person's memberships is
-- their strongest role — app.brand_role() relies on that ordering.
create type member_role as enum (
  'platform_admin',   -- Signage.com: every brand
  'brand_admin',      -- franchisor corporate: everything in one brand
  'brand_reviewer',   -- franchisor corporate: approvals + reading
  'franchisee_owner', -- one franchisee company's stores
  'franchisee_staff'  -- named stores only
);

-- ------------------------------------------------------------------- profiles
create table profiles (
  -- The Supabase Auth user id. Not defaulted: a profile exists only because an
  -- account was created for it, and the account supplies the id.
  id               uuid primary key,
  email            text not null,
  name             text,
  phone            text,
  -- Account lockout (§10.3.3). Counted here rather than in the auth provider so
  -- the rule is the same under both, and so an admin can see and clear it.
  failed_sign_ins  integer not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);

create unique index profiles_email_idx on profiles (lower(email));

-- ---------------------------------------------------------------- franchisees
-- A franchisee is a COMPANY that owns stores, not an email address (§10.1): if
-- it were one person, a store would be orphaned the first time its manager
-- changed.
create table franchisees (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index franchisees_brand_idx on franchisees (brand_id);

alter table locations add column franchisee_id uuid references franchisees (id);
create index locations_franchisee_idx on locations (franchisee_id);

-- Who submitted it, when that was a signed-in person. `requester_*` stays: it is
-- the contact on the request, which is not the same fact as the account.
alter table requests add column created_by uuid references profiles (id);

-- ---------------------------------------------------------------- memberships
create table memberships (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  brand_id       uuid references brands (id) on delete cascade,
  role           member_role not null,
  franchisee_id  uuid references franchisees (id) on delete cascade,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  deactivated_at timestamptz,

  -- Signage.com spans brands; everyone else belongs to exactly one.
  constraint memberships_brand_scope check ((role = 'platform_admin') = (brand_id is null)),
  -- A franchisee role without a company would see nothing, silently.
  constraint memberships_franchisee_scope check (
    (role in ('franchisee_owner', 'franchisee_staff')) = (franchisee_id is not null)
  )
);

create unique index memberships_platform_idx on memberships (profile_id)
  where role = 'platform_admin';
create unique index memberships_brand_role_idx on memberships (profile_id, brand_id, role)
  where brand_id is not null;
create index memberships_brand_idx on memberships (brand_id);

-- The staff scope: which of the company's stores a staff member may see.
create table membership_locations (
  membership_id uuid not null references memberships (id) on delete cascade,
  location_id   uuid not null references locations (id) on delete cascade,
  primary key (membership_id, location_id)
);

-- ---------------------------------------------------------------- invitations
-- The only way an account comes to exist (§10.3.1). Hashed and single-use, like
-- review and corporate links, so a database dump is not a set of sign-ups.
create table invitations (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid references brands (id) on delete cascade,
  email                text not null,
  role                 member_role not null,
  -- Set when inviting into an EXISTING company (a second owner, or staff). A
  -- new franchisee owner leaves it null and names the company on sign-up.
  franchisee_id        uuid references franchisees (id) on delete cascade,
  location_ids         uuid[] not null default '{}',
  -- Null only for an invitation minted by the bootstrap script, which is how
  -- the first platform_admin comes to exist.
  invited_by           uuid references memberships (id) on delete set null,
  token_hash           text not null unique,
  expires_at           timestamptz not null,
  accepted_at          timestamptz,
  accepted_profile_id  uuid references profiles (id),
  revoked_at           timestamptz,
  created_at           timestamptz not null default now(),

  constraint invitations_brand_scope check ((role = 'platform_admin') = (brand_id is null)),
  constraint invitations_staff_scope check (
    role <> 'franchisee_staff' or franchisee_id is not null
  )
);

create index invitations_email_idx on invitations (lower(email));
create index invitations_brand_idx on invitations (brand_id);

-- ------------------------------------------------------------ password resets
-- Ours, not Supabase's recovery flow: the email goes through the same Resend
-- pipeline as every other message, and the link is a token we resolve, so it
-- works on a different device from the one that asked (DECISIONS #108).
create table password_resets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index password_resets_profile_idx on password_resets (profile_id);

-- ------------------------------------------------------------- brand settings
alter table brands
  -- §8c's approved-domains list, made concrete. An invitation outside it warns
  -- and is allowed (§10.7 D5).
  add column franchisee_email_domains text[] not null default '{}',
  -- §10.7 D8: a brand may require two-factor of its own admins and reviewers.
  add column require_two_factor boolean not null default false;

-- ------------------------------------------------------------------- helpers
-- The signed-in person, from the verified JWT's subject. Supabase issues `sub`
-- as the auth user id, which is the profile id.
create or replace function app.current_profile()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = app.current_profile()
       and m.role = 'platform_admin'
       and m.active
  );
$$;

-- Redefined, not replaced: every `team_all` policy in the build calls this, so
-- changing its body moves them all from the allowlist to memberships at once.
-- `team_members` no longer grants anything.
create or replace function app.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.is_platform_admin();
$$;

-- The caller's strongest role on a brand, or null. A platform_admin holds every
-- brand. Relies on member_role being declared most-powerful first.
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
    )
  end;
$$;

-- Whether the caller may see a store (§10.2): the team; the brand's admins and
-- reviewers; the owning company's owners; and staff assigned to it by name.
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
       and (
         m.role in ('brand_admin', 'brand_reviewer')
         or (m.role = 'franchisee_owner' and m.franchisee_id = l.franchisee_id)
         or (m.role = 'franchisee_staff' and m.franchisee_id = l.franchisee_id and exists (
               select 1 from membership_locations ml
                where ml.membership_id = m.id and ml.location_id = l.id))
       )
  );
$$;

grant execute on function app.current_profile() to anon, authenticated;
grant execute on function app.is_platform_admin() to anon, authenticated;
grant execute on function app.brand_role(uuid) to anon, authenticated;
grant execute on function app.can_see_location(uuid) to anon, authenticated;

-- ------------------------------------------------------------------- §10 RLS
-- Phase A's policies are the team's, plus each person reading their own profile
-- and memberships. Brand- and store-scoped reads of the workflow tables arrive
-- with the phases that have screens for them (B, C); the helpers above are what
-- they will be written against, and are tested now.
alter table profiles             enable row level security;
alter table franchisees          enable row level security;
alter table memberships          enable row level security;
alter table membership_locations enable row level security;
alter table invitations          enable row level security;
alter table password_resets      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'franchisees', 'memberships', 'membership_locations',
    'invitations', 'password_resets'
  ]
  loop
    execute format(
      'create policy team_all on %I for all to authenticated
         using (app.is_team_member()) with check (app.is_team_member())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end;
$$;

create policy profiles_self_read on profiles
  for select to authenticated using (id = app.current_profile());

create policy memberships_self_read on memberships
  for select to authenticated using (profile_id = app.current_profile());

-- Invitations and resets are resolved server-side from the presented token and
-- are never read by anon or by their subject: a policy letting a token read its
-- own row would leak nothing useful and invite enumeration of the rest. Nothing
-- is granted to anon on any table here.
