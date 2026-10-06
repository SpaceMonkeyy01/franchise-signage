// Where the Design Studio engine's credential comes from (DECISIONS #183):
// the host's SIGNIZE_SESSION_TOKEN when set, else the token the team saved on
// /admin/pricing (app_settings). SERVER ONLY — the token never reaches a page.

import { query, queryOne } from '../db/pool';

const KEY = 'signize_session_token';
/** Read at most once a minute: every Studio call needs it. */
const TTL_MS = 60_000;
let cached: { at: number; value: string | null } | null = null;

export async function engineToken(): Promise<string | null> {
  if (process.env.SIGNIZE_SESSION_TOKEN) return process.env.SIGNIZE_SESSION_TOKEN;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const row = await queryOne<{ value: string }>(`select value from app_settings where key = $1`, [KEY]).catch(
    () => null,
  );
  cached = { at: Date.now(), value: row?.value ?? null };
  return cached.value;
}

export interface EngineConnection {
  source: 'environment' | 'console' | null;
  savedAt: string | null;
  savedBy: string | null;
}

/** What the console shows: where the token comes from, never the token. */
export async function engineConnection(): Promise<EngineConnection> {
  const row = await queryOne<{ updated_at: string; updated_by: string }>(
    `select updated_at, updated_by from app_settings where key = $1`,
    [KEY],
  );
  if (process.env.SIGNIZE_SESSION_TOKEN) return { source: 'environment', savedAt: null, savedBy: null };
  return row ? { source: 'console', savedAt: row.updated_at, savedBy: row.updated_by } : { source: null, savedAt: null, savedBy: null };
}

export class TokenError extends Error {}

export async function saveEngineToken(token: string, savedBy: string): Promise<void> {
  const value = token.trim();
  if (value.length < 20 || /\s/.test(value)) throw new TokenError('That does not look like a Signize session token.');
  await query(
    `insert into app_settings (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, value, savedBy],
  );
  cached = null;
}
