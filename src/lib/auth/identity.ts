// Identity: "who is this, and how sure are we?" (SPEC v2.3 §10.3.3).
//
// Everything that authenticates goes through this file, and nothing in it
// decides what anyone may do — that is memberships, in ./access.ts. The split is
// the one team.ts always had (identity swappable, authorization fixed), widened
// from one allowlist to five roles.
//
// Two providers behind one interface:
//
//   supabase — Supabase Auth: the real thing, required in production.
//   dev      — for a machine with no Supabase project (no Docker here; see
//              docs/STATE.md). Unlike the picker it replaces, it is a real
//              password login: scrypt hashes, server-side sessions, and real
//              TOTP codes, in a `dev_auth` schema that exists only in the dev
//              database and is never migrated anywhere else. A stand-in that
//              trusted the browser would leave every screen in this phase
//              unexercised by the smoke suite. It refuses to run in production.
//
// Sessions are established only by Server Actions and Route Handlers, which are
// the only places a cookie can be written (Next 16 `cookies()`).

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { query, queryOne } from '../db/pool';
import { DEV_AUTH_SCHEMA, hashPassword, passwordMatches } from './dev-auth';
import { hashToken } from './tokens';
import { newTotpSecret, otpauthUri, totpCode, verifyTotp as checkTotp } from './totp';

export type AuthProvider = 'supabase' | 'dev';

export interface Identity {
  userId: string;
  email: string;
  /** `aal2` once a second factor has been passed in this session. */
  aal: 'aal1' | 'aal2';
  /** When the password was last entered — the 12-hour admin limit runs from here. */
  authenticatedAt: Date;
}

export interface TotpEnrollment {
  factorId: string;
  secret: string;
  uri: string;
  /** Supabase supplies a QR code as an SVG data URI; the dev provider does not. */
  qrCode?: string;
}

/** Which identity provider is in play, and why. */
export function authProvider(): AuthProvider {
  const configured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (configured) return 'supabase';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No Supabase project is configured, so nobody can be authenticated. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return 'dev';
}

const SESSION_DAYS = 30;

// ------------------------------------------------------------------ interface

export async function getIdentity(): Promise<Identity | null> {
  return authProvider() === 'supabase' ? supabase.getIdentity() : dev.getIdentity();
}

/** Checks the password and, if it is right, starts a session. Server Actions only. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  return authProvider() === 'supabase'
    ? supabase.signIn(email, password)
    : dev.signIn(email, password);
}

/**
 * Create the identity for an accepted invitation. The address is already
 * proven — the invitation token was mailed to it — so it is created confirmed.
 */
export async function createAccount(
  email: string,
  password: string,
): Promise<{ userId: string } | { error: 'exists' | string }> {
  return authProvider() === 'supabase'
    ? supabase.createAccount(email, password)
    : dev.createAccount(email, password);
}

/** Undo `createAccount` when the rest of an acceptance fails, so a retry can succeed. */
export async function deleteAccount(userId: string): Promise<void> {
  return authProvider() === 'supabase' ? supabase.deleteAccount(userId) : dev.deleteAccount(userId);
}

/** Replace a password (the reset flow). Existing sessions are ended where the provider allows. */
export async function setPassword(userId: string, password: string): Promise<void> {
  return authProvider() === 'supabase'
    ? supabase.setPassword(userId, password)
    : dev.setPassword(userId, password);
}

export async function endSession(): Promise<void> {
  return authProvider() === 'supabase' ? supabase.endSession() : dev.endSession();
}

/** The signed-in person's authenticator factors. */
export async function totpFactors(): Promise<Array<{ id: string; verified: boolean }>> {
  return authProvider() === 'supabase' ? supabase.factors() : dev.factors();
}

/** Start enrolling an authenticator app, replacing any half-finished enrolment. */
export async function enrollTotp(email: string): Promise<TotpEnrollment> {
  return authProvider() === 'supabase' ? supabase.enroll() : dev.enroll(email);
}

/** Check a code and, if right, raise this session to aal2. Server Actions only. */
export async function verifyTotp(factorId: string, code: string): Promise<boolean> {
  return authProvider() === 'supabase'
    ? supabase.verify(factorId, code)
    : dev.verify(factorId, code);
}

/** Remove someone's authenticator (lost phone). A platform_admin action. */
export async function resetTotp(userId: string): Promise<void> {
  return authProvider() === 'supabase' ? supabase.resetFactors(userId) : dev.resetFactors(userId);
}

/**
 * The code an authenticator would show right now — DEV ONLY.
 *
 * So the dev sign-in can print it, and the smoke suite can type it. Returns null
 * under Supabase, where the secret never leaves Supabase Auth.
 */
export async function devCurrentCode(factorId: string): Promise<string | null> {
  if (authProvider() !== 'dev') return null;
  return dev.currentCode(factorId);
}

// ------------------------------------------------------------ dev provider

const DEV_SESSION_COOKIE = 'fs_dev_session';

let devSchema: Promise<void> | null = null;

/** Created on first use, and only ever in the dev database. */
function ensureDevSchema(): Promise<void> {
  devSchema ??= query(DEV_AUTH_SCHEMA).then(() => undefined);
  return devSchema;
}

async function devSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEV_SESSION_COOKIE)?.value ?? null;
}

const dev = {
  async getIdentity(): Promise<Identity | null> {
    const token = await devSessionToken();
    if (!token) return null;
    await ensureDevSchema();
    const row = await queryOne<{
      user_id: string;
      email: string;
      aal: 'aal1' | 'aal2';
      authenticated_at: string;
    }>(
      `select s.user_id, u.email, s.aal, s.authenticated_at
         from dev_auth.sessions s join dev_auth.users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [hashToken(token)],
    );
    if (!row) return null;
    return {
      userId: row.user_id,
      email: row.email,
      aal: row.aal,
      authenticatedAt: new Date(row.authenticated_at),
    };
  },

  async signIn(email: string, password: string): Promise<string | null> {
    await ensureDevSchema();
    const user = await queryOne<{ id: string; password_hash: string }>(
      `select id, password_hash from dev_auth.users where lower(email) = lower($1)`,
      [email.trim()],
    );
    if (!user || !passwordMatches(password, user.password_hash)) return null;

    const token = randomBytes(32).toString('base64url');
    await query(
      `insert into dev_auth.sessions (token_hash, user_id, expires_at)
       values ($1, $2, now() + ($3 || ' days')::interval)`,
      [hashToken(token), user.id, SESSION_DAYS],
    );
    const store = await cookies();
    store.set(DEV_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    return user.id;
  },

  async createAccount(email: string, password: string) {
    await ensureDevSchema();
    const existing = await queryOne<{ id: string }>(
      `select id from dev_auth.users where lower(email) = lower($1)`,
      [email.trim()],
    );
    if (existing) return { error: 'exists' as const };
    const row = await queryOne<{ id: string }>(
      `insert into dev_auth.users (email, password_hash) values ($1, $2) returning id`,
      [email.trim(), hashPassword(password)],
    );
    return { userId: row!.id };
  },

  async deleteAccount(userId: string): Promise<void> {
    await ensureDevSchema();
    await query(`delete from dev_auth.users where id = $1`, [userId]);
  },

  async setPassword(userId: string, password: string): Promise<void> {
    await ensureDevSchema();
    await query(`update dev_auth.users set password_hash = $2 where id = $1`, [
      userId,
      hashPassword(password),
    ]);
    // A reset is often BECAUSE someone else knew the password.
    await query(`delete from dev_auth.sessions where user_id = $1`, [userId]);
  },

  async endSession(): Promise<void> {
    const token = await devSessionToken();
    const store = await cookies();
    store.delete(DEV_SESSION_COOKIE);
    if (!token) return;
    await ensureDevSchema();
    await query(`delete from dev_auth.sessions where token_hash = $1`, [hashToken(token)]);
  },

  async factors() {
    const identity = await dev.getIdentity();
    if (!identity) return [];
    const rows = await query<{ id: string; verified_at: string | null }>(
      `select id, verified_at from dev_auth.factors where user_id = $1 order by created_at`,
      [identity.userId],
    );
    return rows.map((row) => ({ id: row.id, verified: row.verified_at !== null }));
  },

  async enroll(email: string): Promise<TotpEnrollment> {
    const identity = await dev.getIdentity();
    if (!identity) throw new Error('Not signed in.');
    await query(`delete from dev_auth.factors where user_id = $1 and verified_at is null`, [
      identity.userId,
    ]);
    const secret = newTotpSecret();
    const row = await queryOne<{ id: string }>(
      `insert into dev_auth.factors (user_id, secret) values ($1, $2) returning id`,
      [identity.userId, secret],
    );
    return { factorId: row!.id, secret, uri: otpauthUri(secret, email) };
  },

  async verify(factorId: string, code: string): Promise<boolean> {
    const token = await devSessionToken();
    const identity = await dev.getIdentity();
    if (!token || !identity) return false;
    const factor = await queryOne<{ secret: string }>(
      `select secret from dev_auth.factors where id = $1 and user_id = $2`,
      [factorId, identity.userId],
    );
    if (!factor || !checkTotp(factor.secret, code)) return false;
    await query(`update dev_auth.factors set verified_at = coalesce(verified_at, now()) where id = $1`, [
      factorId,
    ]);
    await query(`update dev_auth.sessions set aal = 'aal2' where token_hash = $1`, [
      hashToken(token),
    ]);
    return true;
  },

  async resetFactors(userId: string): Promise<void> {
    await ensureDevSchema();
    await query(`delete from dev_auth.factors where user_id = $1`, [userId]);
    await query(`update dev_auth.sessions set aal = 'aal1' where user_id = $1`, [userId]);
  },

  async currentCode(factorId: string): Promise<string | null> {
    await ensureDevSchema();
    const factor = await queryOne<{ secret: string }>(
      `select secret from dev_auth.factors where id = $1`,
      [factorId],
    );
    return factor ? totpCode(factor.secret) : null;
  },
};

// ------------------------------------------------------- supabase provider

async function sessionClient() {
  const { createServerClient } = await import('@supabase/ssr');
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // A Server Component cannot write cookies; the Server Action that
          // signs in, verifies a code or signs out can, and those are the
          // only places a session changes.
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* rendering: read-only */
          }
        },
      },
    },
  );
}

/**
 * The service-role client, for creating accounts and setting passwords.
 *
 * Built here rather than through src/lib/supabase/clients.ts: that one goes
 * through serverEnv(), which demands the whole configuration (a Resend key
 * included) before it will create anything (#93).
 */
async function serviceClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to manage accounts.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const supabase = {
  async getIdentity(): Promise<Identity | null> {
    const client = await sessionClient();
    const { data } = await client.auth.getUser();
    if (!data.user?.email) return null;

    const { data: level } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    const methods = (level?.currentAuthenticationMethods ?? []) as Array<
      { method: string; timestamp: number } | string
    >;
    const password = methods.find(
      (entry): entry is { method: string; timestamp: number } =>
        typeof entry === 'object' && entry.method === 'password',
    );
    return {
      userId: data.user.id,
      email: data.user.email,
      aal: level?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
      // No password entry means the session did not come from a password —
      // treated as the epoch, so anything with a time limit asks again.
      authenticatedAt: new Date((password?.timestamp ?? 0) * 1000),
    };
  },

  async signIn(email: string, password: string): Promise<string | null> {
    const client = await sessionClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return null;
    return data.user.id;
  },

  async createAccount(email: string, password: string) {
    const admin = await serviceClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });
    if (error) {
      return { error: error.code === 'email_exists' ? ('exists' as const) : error.message };
    }
    return { userId: data.user.id };
  },

  async deleteAccount(userId: string): Promise<void> {
    const admin = await serviceClient();
    await admin.auth.admin.deleteUser(userId);
  },

  async setPassword(userId: string, password: string): Promise<void> {
    const admin = await serviceClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(error.message);
  },

  async endSession(): Promise<void> {
    const client = await sessionClient();
    await client.auth.signOut();
  },

  async factors() {
    const client = await sessionClient();
    const { data } = await client.auth.mfa.listFactors();
    return (data?.all ?? [])
      .filter((factor) => factor.factor_type === 'totp')
      .map((factor) => ({ id: factor.id, verified: factor.status === 'verified' }));
  },

  async enroll(): Promise<TotpEnrollment> {
    const client = await sessionClient();
    // Supabase refuses a second unverified factor; a half-finished enrolment
    // from an abandoned attempt is cleared first.
    const { data: existing } = await client.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        await client.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) throw new Error(error?.message ?? 'Could not start two-factor enrolment.');
    return {
      factorId: data.id,
      secret: data.totp.secret,
      uri: data.totp.uri,
      qrCode: data.totp.qr_code,
    };
  },

  async verify(factorId: string, code: string): Promise<boolean> {
    const client = await sessionClient();
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s+/g, ''),
    });
    return !error;
  },

  async resetFactors(userId: string): Promise<void> {
    const admin = await serviceClient();
    const { data } = await admin.auth.admin.mfa.listFactors({ userId });
    for (const factor of data?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    }
  },
};
