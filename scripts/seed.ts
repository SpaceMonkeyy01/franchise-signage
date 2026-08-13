// Seed: master catalog + the Freshbites pilot brand (SPEC §9 interface 7).
//
//   npm run seed            — idempotent; safe to re-run
//   npm run seed -- --reset — drop the brand and its locations first
//
// A script, not an admin UI, on purpose: brand #2 is when CRUD gets built.
// Everything it writes is reproducible from docs/ — the taxonomy TSV and the
// demo's Freshbites configuration — so a wiped database is never a lost setup.

import { config as loadEnv } from 'dotenv';

import { adminClient } from '../src/lib/supabase/clients';
import * as fb from './seed/freshbites';
import { masterKey, parseTaxonomy, type MasterCatalogRow } from './seed/taxonomy';

loadEnv({ path: '.env.local' });
loadEnv();

const RESET = process.argv.includes('--reset');

type Client = ReturnType<typeof adminClient>;

function ok<T>({ data, error }: { data: T; error: { message: string } | null }, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// ------------------------------------------------------------ master catalog

async function seedMasterCatalog(db: Client): Promise<Map<string, string>> {
  const rows = parseTaxonomy();

  const existing = ok(
    await db.from('master_catalog').select('id, placement, sign_type, variant'),
    'read master_catalog',
  ) as Array<{ id: string; placement: string; sign_type: string; variant: string | null }>;

  const idByKey = new Map(existing.map((row) => [masterKey(row), row.id]));

  const toInsert: MasterCatalogRow[] = [];
  const toUpdate: Array<{ id: string; row: MasterCatalogRow }> = [];

  for (const row of rows) {
    const id = idByKey.get(masterKey(row));
    if (id) toUpdate.push({ id, row });
    else toInsert.push(row);
  }

  if (toInsert.length > 0) {
    const inserted = ok(
      await db.from('master_catalog').insert(toInsert).select('id, placement, sign_type, variant'),
      'insert master_catalog',
    ) as Array<{ id: string; placement: string; sign_type: string; variant: string | null }>;
    for (const row of inserted) idByKey.set(masterKey(row), row.id);
  }

  // Re-running after a taxonomy re-sync should move render keys and pricing
  // basis, not create duplicates.
  for (const { id, row } of toUpdate) {
    ok(await db.from('master_catalog').update(row).eq('id', id).select('id'), 'update master_catalog');
  }

  console.log(
    `master_catalog: ${rows.length} rows (${toInsert.length} inserted, ${toUpdate.length} updated)`,
  );
  return idByKey;
}

// ------------------------------------------------------------ Freshbites brand

async function resetBrand(db: Client): Promise<void> {
  const brand = ok(
    await db.from('brands').select('id').eq('slug', fb.brand.slug).maybeSingle(),
    'read brand',
  ) as { id: string } | null;
  if (!brand) return;

  // Locations first: their cascade takes requests, line items, events, files
  // and quotes with them, which has to happen before brand_items goes away —
  // line_items.brand_item_id and installed_signs.brand_item_id are RESTRICT.
  ok(await db.from('locations').delete().eq('brand_id', brand.id).select('id'), 'delete locations');
  ok(await db.from('brands').delete().eq('id', brand.id).select('id'), 'delete brand');
  console.log('reset: removed the existing Freshbites brand and its locations');
}

async function seedBrand(db: Client, masterIds: Map<string, string>): Promise<void> {
  const existing = ok(
    await db.from('brands').select('id').eq('slug', fb.brand.slug).maybeSingle(),
    'read brand',
  ) as { id: string } | null;

  const brandId = existing
    ? (ok(
        await db.from('brands').update(fb.brand).eq('id', existing.id).select('id').single(),
        'update brand',
      ) as { id: string }
      ).id
    : (ok(await db.from('brands').insert(fb.brand).select('id').single(), 'insert brand') as {
        id: string;
      }
      ).id;

  // ---- brand items
  const itemRows = fb.brandItems.map((item) => {
    const [placement, sign_type, variant] = item.master;
    const masterCatalogId = masterIds.get(masterKey({ placement, sign_type, variant }));
    if (!masterCatalogId) {
      throw new Error(
        `Brand item "${item.name}" pins a taxonomy row that is not in master_catalog: ` +
          `${placement} / ${sign_type} / ${variant ?? '(no variant)'}`,
      );
    }
    return {
      brand_id: brandId,
      master_catalog_id: masterCatalogId,
      name: item.name,
      pinned_attributes: item.pinned_attributes,
      site_variables: item.site_variables,
      spec_summary: item.spec_summary,
      est_price: item.est_price,
      vendor_policy_override: item.vendor_policy_override,
      sort_order: item.sort_order,
    };
  });

  const items = ok(
    await db.from('brand_items').upsert(itemRows, { onConflict: 'brand_id,name' }).select('id, name'),
    'upsert brand_items',
  ) as Array<{ id: string; name: string }>;
  const itemIdByName = new Map(items.map((row) => [row.name, row.id]));
  console.log(`brand_items: ${items.length}`);

  // ---- packages
  const packageRows = fb.packages.map((pkg) => ({
    brand_id: brandId,
    format: pkg.format,
    label: pkg.label,
    description: pkg.description,
    // Duplicates preserved: the endcap really does take two storefront sets.
    items: pkg.items.map((name) => {
      const id = itemIdByName.get(name);
      if (!id) throw new Error(`Package ${pkg.format} names an unknown brand item "${name}"`);
      return id;
    }),
  }));

  ok(
    await db
      .from('brand_packages')
      .upsert(packageRows, { onConflict: 'brand_id,format' })
      .select('id'),
    'upsert brand_packages',
  );
  console.log(`brand_packages: ${packageRows.length}`);

  // ---- locations + the installed-sign record
  for (const location of [fb.oakPlaza, fb.cedarPark]) {
    const found = ok(
      await db
        .from('locations')
        .select('id')
        .eq('brand_id', brandId)
        .eq('name', location.name)
        .maybeSingle(),
      'read location',
    ) as { id: string } | null;

    const row = {
      brand_id: brandId,
      name: location.name,
      address: location.address,
      format: location.format,
      opening_date: location.opening_date,
    };

    const locationId = found
      ? (ok(
          await db.from('locations').update(row).eq('id', found.id).select('id').single(),
          'update location',
        ) as { id: string }
        ).id
      : (ok(await db.from('locations').insert(row).select('id').single(), 'insert location') as {
          id: string;
        }
        ).id;

    if (location.installedSigns.length === 0) continue;

    // The installed record is what makes every later request a lookup. Rebuild
    // it wholesale rather than diffing — nothing references these rows until a
    // real replacement request does.
    ok(
      await db.from('installed_signs').delete().eq('location_id', locationId).select('id'),
      'clear installed_signs',
    );
    ok(
      await db.from('installed_signs').insert(
        location.installedSigns.map((sign) => {
          const brandItemId = itemIdByName.get(sign.brandItem);
          if (!brandItemId) {
            throw new Error(`Installed sign names an unknown brand item "${sign.brandItem}"`);
          }
          return {
            location_id: locationId,
            brand_item_id: brandItemId,
            sizing: sign.sizing,
            installed_at: sign.installed_at,
          };
        }),
      ).select('id'),
      'insert installed_signs',
    );
    console.log(`${location.name}: ${location.installedSigns.length} installed signs`);
  }

  // ---- team allowlist
  ok(
    await db.from('team_members').upsert(fb.teamMembers, { onConflict: 'email' }).select('id'),
    'upsert team_members',
  );
  console.log(`team_members: ${fb.teamMembers.length}`);
}

// ------------------------------------------------------------------- runner

async function main() {
  const db = adminClient();

  if (RESET) await resetBrand(db);
  const masterIds = await seedMasterCatalog(db);
  await seedBrand(db, masterIds);

  console.log('\nSeed complete. Freshbites is live at /freshbites.');
}

main().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
