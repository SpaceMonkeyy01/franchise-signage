// Supabase clients, one per access model (SPEC §10).
//
// Which client you pick IS the authorization decision, so pick deliberately:
//
//   franchiseeClient(token) — anon role, carrying the request's access token.
//     RLS scopes every read and write to that one request. This is the default
//     for anything a franchisee triggers.
//   adminClient()          — service role, bypasses RLS entirely. For the status
//     transition helper, the seed script, and scheduled jobs. Never construct it
//     in response to an unauthenticated request without checking authorization
//     first.
//   teamClient()           — the signed-in team member's own session; RLS gates
//     it on the team_members allowlist.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { serverEnv } from '../env';

const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/**
 * Anon client carrying a franchisee's request token.
 *
 * The token travels as a header so it reaches RLS via
 * `current_setting('request.headers')` — see app.access_token() in the RLS
 * migration. Application code should still verify the token resolves to the
 * request it expects; RLS is the backstop, not the only check.
 */
export function franchiseeClient(accessToken: string): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...NO_PERSIST,
    global: { headers: { 'x-access-token': accessToken } },
  });
}

/** Service-role client. Bypasses RLS — see the file header before using. */
export function adminClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, NO_PERSIST);
}

/** Anon client with no token: reads only the public catalog and brands_public. */
export function publicClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, NO_PERSIST);
}
