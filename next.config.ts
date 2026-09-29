import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres and must not be bundled — it is loaded at
  // runtime by the dev database (src/lib/db/dev-postgres.ts). Harmless in
  // production, where the Supabase adapter is used instead and PGlite is never
  // imported.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Brand portals in development (SPEC v2.3 §10.4): freshbites.localhost:3000
  // is a brand's address, and the dev server refuses its own assets to any
  // origin it was not told about.
  allowedDevOrigins: ['*.localhost'],
  // The dev server logs every Server Action with its arguments — and sign-in,
  // sign-up and password reset take passwords as arguments. Found when a real
  // password appeared in the dev log during the Supabase accounts check.
  logging: { serverFunctions: false },
};

export default nextConfig;
