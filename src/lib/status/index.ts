// The status machine: the single write path for request status (SPEC §6).
//
// Import from here, not from the individual modules.

export * from './types';
export * from './events';
export * from './machine';
export * from './writeback';
export * from './transition';
// The only StatusStore implementation is src/lib/db/pg-status-store.ts: the app
// talks SQL through `pg` to both the dev database and Supabase, so the
// supabase-js adapter that used to sit here had no caller.
