// Seed a database with the master catalog and the Freshbites pilot brand
// (SPEC §9 interface 7).
//
//   npm run seed                          — seeds DATABASE_URL, or the dev database
//   npm run seed -- --reset               — drop the brand and its locations first
//   npm run seed -- --with-demo-requests  — add REQ-0016…19 from the demo
//
// A script, not an admin UI, on purpose: brand #2 is when CRUD gets built.
// Everything it writes is reproducible from docs/ — the taxonomy TSV and the
// demo's Freshbites configuration — so a wiped database is never a lost setup.
//
// The dev database seeds itself on first boot (scripts/dev-db-server.ts). This
// entry point exists for a real target: point DATABASE_URL at a Supabase
// project's connection string and the same statements run there.

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

import { seedFreshbites, seedMasterCatalog } from './seed/apply';
import { seedDemoRequests } from './seed/demo-requests';
import { brand } from './seed/freshbites';

loadEnv({ path: '.env.local' });
loadEnv();

const RESET = process.argv.includes('--reset');
const WITH_DEMO = process.argv.includes('--with-demo-requests');

const CONNECTION =
  process.env.DATABASE_URL ??
  `postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT ?? 5433}/postgres`;

async function main() {
  const client = new pg.Client({
    connectionString: CONNECTION,
    ssl: CONNECTION.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  console.log(`seeding ${CONNECTION.replace(/:[^:@]+@/, ':***@')}`);

  try {
    if (RESET) {
      // Locations first: their cascade takes requests, line items, events, files
      // and quotes with them, which has to happen before brand_items goes away —
      // line_items.brand_item_id and installed_signs.brand_item_id are RESTRICT.
      await client.query(
        `delete from locations where brand_id in (select id from brands where slug = $1)`,
        [brand.slug],
      );
      await client.query(`delete from brands where slug = $1`, [brand.slug]);
      console.log('reset: removed the existing Freshbites brand and its locations');
    }

    const masterIds = await seedMasterCatalog(client);
    console.log(`master_catalog: ${masterIds.size} rows`);

    const seeded = await seedFreshbites(client, masterIds);
    console.log(
      `brand_items: ${seeded.itemIdByName.size} · locations: ${seeded.locationIdByName.size}`,
    );

    if (WITH_DEMO) {
      await seedDemoRequests(client, seeded);
      console.log('demo requests: REQ-0016, REQ-0017, REQ-0018, REQ-0019');
    }

    console.log('\nSeed complete. Freshbites is live at /freshbites.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
