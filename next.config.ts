import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres and must not be bundled — it is loaded at
  // runtime by the dev database (src/lib/db/dev-postgres.ts). Harmless in
  // production, where the Supabase adapter is used instead and PGlite is never
  // imported.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
