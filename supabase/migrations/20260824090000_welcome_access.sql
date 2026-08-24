-- Level 1 access: the registration's own link (SPEC §8d).
--
-- `franchisee_registrations` landed in the DID migration as an identity record —
-- corporate registers an email at agreement signing, and that is the only
-- franchisee identity that exists before a lease. It had no way IN, because the
-- destination §8d names for the welcome email is the §8c brand-email magic
-- link, which is Session 8.
--
-- The half of the welcome payload that exists today is the budget number, and it
-- needs somewhere a franchisee can reach without an account. So the registration
-- gets a token of its own, exactly like `requests.access_token`: opaque, in the
-- URL, and the credential itself (SPEC §10). It is not a substitute for the
-- magic link — when §8c lands, the DID button on that page is what the magic
-- link protects, and this token still addresses the page.

alter table franchisee_registrations
  add column access_token text not null unique default encode(gen_random_bytes(24), 'hex');

create index franchisee_registrations_token_idx
  on franchisee_registrations (access_token);

-- ------------------------------------------------------------------- §10 RLS
-- Replaces the blanket refusal the DID migration wrote. That policy was correct
-- while nothing anon-facing read this table; now the level-1 landing page does,
-- and the predicate has to be the token rather than `false`.
--
-- Dropped rather than left alongside: permissive policies are OR'd, so leaving
-- `using (false)` in place would still work and would read as though anon were
-- denied. A policy that lies about its own effect is worse than no policy.
drop policy franchisee_registrations_no_anon on franchisee_registrations;

create policy franchisee_registrations_token_read on franchisee_registrations
  for select to anon
  using (access_token = app.access_token() and app.access_token() is not null);

grant select on franchisee_registrations to anon;
