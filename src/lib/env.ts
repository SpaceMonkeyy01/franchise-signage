// Environment configuration, validated once at import.
//
// Anything that differs between brands, deploys, or pricing decisions belongs
// here rather than in a constant — notably the DID fee (SPEC §8c), which is an
// open question with a placeholder value and must never be hardcoded.

import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Bypasses RLS. Server-only — never expose it to the browser. Used by the
  // status transition helper, the seed script, and scheduled functions.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),
  // Franchisee-facing mail is sent AS the brand (SPEC §8d), so this is the
  // fallback sender for anything not brand-scoped.
  RESEND_FROM_EMAIL: z.string().email().default('noreply@signage.com'),

  // Absolute origin, used to build tokenized links in email.
  APP_URL: z.string().url().default('http://localhost:3000'),

  // §8c placeholder — $499. Brand-level overrides live in brands.did_fee_cents.
  DID_FEE_CENTS: z.coerce.number().int().nonnegative().default(49900),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Validated server environment.
 *
 * Lazy rather than module-level so `next build` and the test run do not require
 * a full env — only code paths that actually talk to Supabase or Resend do.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${missing.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

/** The DID fee to charge for a brand, in cents (SPEC §8c). */
export function didFeeCents(brandOverride: number | null | undefined): number {
  return brandOverride ?? serverEnv().DID_FEE_CENTS;
}
