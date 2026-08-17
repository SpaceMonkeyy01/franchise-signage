-- Reviewer links and the record of what was sent (SPEC §7, §9 interface 3).
--
-- The corporate reviewer never gets a database identity (SPEC §10): they act
-- from a link in an email. That link is the credential, so it is stored as a
-- HASH — a dump of this table must not hand anyone a working approval link, the
-- same reason a password column would store a hash.

create table review_links (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references requests (id) on delete cascade,
  -- Who it was sent to. Kept per link rather than read from brands at use time:
  -- a brand can change reviewer_email, and the record of who was actually asked
  -- must not change with it.
  reviewer_email  text not null,
  token_hash      text not null unique,
  -- Which package version the reviewer was shown. A resubmission mints a new
  -- link and revokes this one, so a stale email cannot approve a package that
  -- has since been edited.
  package_version integer not null,
  expires_at      timestamptz not null,
  -- Set when the review is finished — no items left pending on this version.
  used_at         timestamptz,
  -- Set when a newer package version supersedes this link.
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index review_links_request_idx on review_links (request_id)
  where used_at is null and revoked_at is null;

-- ------------------------------------------------------------------ outbox
-- Every message the system sends, kept. Not only a dev convenience: "did the
-- reviewer actually get it, and what did it say" is a real support question, and
-- the answer has to survive the provider's retention policy.
create table sent_emails (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid references requests (id) on delete set null,
  -- The template that produced it, e.g. 'review_requested'. Deliberately text:
  -- the notification set grows every session (SPEC §9 interface 5).
  kind                text not null,
  to_email            text not null,
  cc_email            text,
  subject             text not null,
  html                text not null,
  -- 'resend' when it went out, 'outbox' when no provider was configured and the
  -- message was only recorded.
  provider            text not null,
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now()
);

create index sent_emails_request_idx on sent_emails (request_id, created_at desc);
create index sent_emails_recent_idx on sent_emails (created_at desc);

-- ------------------------------------------------------------------- §10 RLS
-- Neither table is reachable by anon: a reviewer presents a token to the
-- application, which resolves it server-side, and nothing about mail belongs to
-- a franchisee's token scope.
alter table review_links enable row level security;
alter table sent_emails  enable row level security;

create policy team_all on review_links for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());
create policy team_all on sent_emails for all to authenticated
  using (app.is_team_member()) with check (app.is_team_member());

grant select, insert, update, delete on review_links, sent_emails to authenticated;

create policy review_links_no_anon on review_links for select to anon using (false);
create policy sent_emails_no_anon on sent_emails for select to anon using (false);
