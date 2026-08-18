// The seed, written once against plain SQL so it runs anywhere.
//
// PGlite (`db.query`) and node-postgres (`pool.query`) share the same
// `(text, params) => { rows }` shape, so the dev database and a real Supabase
// project run byte-identical seed logic. That matters more than it sounds: a
// seed that only works against one of them is a seed that silently drifts.

import * as fb from './freshbites';
import { parseTaxonomy } from './taxonomy';

export interface SqlExec {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

const one = async <T>(db: SqlExec, text: string, params?: unknown[]): Promise<T> => {
  const { rows } = await db.query<T>(text, params);
  if (rows.length === 0) throw new Error(`Expected a row from: ${text.slice(0, 80)}`);
  return rows[0];
};

// ------------------------------------------------------------ master catalog

export async function seedMasterCatalog(db: SqlExec): Promise<Map<string, string>> {
  const rows = parseTaxonomy();

  for (const row of rows) {
    await db.query(
      `insert into master_catalog
         (placement, category, sign_type, variant, attribute_options, pricing_type,
          pricing_basis, render_key, fabricated_finish, source_id, active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (placement, sign_type, (coalesce(variant, '')))
       do update set category = excluded.category,
                     attribute_options = excluded.attribute_options,
                     pricing_type = excluded.pricing_type,
                     pricing_basis = excluded.pricing_basis,
                     render_key = excluded.render_key,
                     fabricated_finish = excluded.fabricated_finish,
                     source_id = excluded.source_id,
                     active = excluded.active`,
      [
        row.placement,
        row.category,
        row.sign_type,
        row.variant,
        JSON.stringify(row.attribute_options),
        row.pricing_type,
        row.pricing_basis,
        row.render_key,
        row.fabricated_finish,
        row.source_id,
        row.active,
      ],
    );
  }

  const { rows: stored } = await db.query<{
    id: string;
    placement: string;
    sign_type: string;
    variant: string | null;
  }>(`select id, placement, sign_type, variant from master_catalog`);

  return new Map(stored.map((r) => [`${r.placement}|${r.sign_type}|${r.variant ?? ''}`, r.id]));
}

// ---------------------------------------------------------------- the brand

export interface SeededBrand {
  brandId: string;
  itemIdByName: Map<string, string>;
  locationIdByName: Map<string, string>;
}

export async function seedFreshbites(
  db: SqlExec,
  masterIds: Map<string, string>,
): Promise<SeededBrand> {
  const b = fb.brand;
  const { id: brandId } = await one<{ id: string }>(
    db,
    `insert into brands
       (name, slug, logo_url, brand_colors, status, approval_mode, reviewer_email,
        review_sla_days, sla_action, vendor_policy, vendor_name, vendor_email,
        corporate_cc, corporate_email, default_tat, did_allowed_email_domains, did_fee_cents)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     on conflict (slug) do update set
       name = excluded.name, brand_colors = excluded.brand_colors,
       status = excluded.status, approval_mode = excluded.approval_mode,
       reviewer_email = excluded.reviewer_email, vendor_policy = excluded.vendor_policy,
       vendor_name = excluded.vendor_name, vendor_email = excluded.vendor_email,
       corporate_cc = excluded.corporate_cc, corporate_email = excluded.corporate_email,
       default_tat = excluded.default_tat
     returning id`,
    [
      b.name, b.slug, b.logo_url, JSON.stringify(b.brand_colors), b.status,
      b.approval_mode, b.reviewer_email, b.review_sla_days, b.sla_action,
      b.vendor_policy, b.vendor_name, b.vendor_email, b.corporate_cc,
      b.corporate_email, b.default_tat, b.did_allowed_email_domains, b.did_fee_cents,
    ],
  );

  // ---- per-policy vendor contacts (§3.1; DECISIONS #20)
  for (const contact of fb.vendorContacts) {
    await db.query(
      `insert into brand_vendor_contacts
         (brand_id, policy, vendor_name, vendor_email, corporate_cc, tat, notes)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (brand_id, policy) do update set
         vendor_name = excluded.vendor_name, vendor_email = excluded.vendor_email,
         corporate_cc = excluded.corporate_cc, tat = excluded.tat, notes = excluded.notes`,
      [
        brandId, contact.policy, contact.vendor_name, contact.vendor_email,
        contact.corporate_cc, contact.tat, contact.notes,
      ],
    );
  }

  // ---- brand items
  const itemIdByName = new Map<string, string>();
  for (const item of fb.brandItems) {
    const [placement, signType, variant] = item.master;
    const masterCatalogId = masterIds.get(`${placement}|${signType}|${variant ?? ''}`);
    if (!masterCatalogId) {
      throw new Error(
        `Brand item "${item.name}" pins a taxonomy row not in master_catalog: ` +
          `${placement} / ${signType} / ${variant ?? '(no variant)'}`,
      );
    }
    const { id } = await one<{ id: string }>(
      db,
      `insert into brand_items
         (brand_id, master_catalog_id, name, pinned_attributes, site_variables,
          spec_summary, est_price, vendor_policy_override, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (brand_id, name) do update set
         master_catalog_id = excluded.master_catalog_id,
         pinned_attributes = excluded.pinned_attributes,
         site_variables = excluded.site_variables,
         spec_summary = excluded.spec_summary,
         est_price = excluded.est_price,
         vendor_policy_override = excluded.vendor_policy_override,
         sort_order = excluded.sort_order
       returning id`,
      [
        brandId, masterCatalogId, item.name, JSON.stringify(item.pinned_attributes),
        item.site_variables, item.spec_summary, item.est_price,
        item.vendor_policy_override, item.sort_order,
      ],
    );
    itemIdByName.set(item.name, id);
  }

  // ---- packages (duplicates in `items` are meaningful — SPEC §3.2)
  for (const pkg of fb.packages) {
    const ids = pkg.items.map((name) => {
      const id = itemIdByName.get(name);
      if (!id) throw new Error(`Package ${pkg.format} names an unknown brand item "${name}"`);
      return id;
    });
    await db.query(
      `insert into brand_packages (brand_id, format, label, description, items)
       values ($1,$2,$3,$4,$5)
       on conflict (brand_id, format) do update set
         label = excluded.label, description = excluded.description, items = excluded.items`,
      [brandId, pkg.format, pkg.label, pkg.description, JSON.stringify(ids)],
    );
  }

  // ---- locations and the installed-sign record
  const locationIdByName = new Map<string, string>();
  for (const location of [fb.oakPlaza, fb.cedarPark]) {
    const existing = await db.query<{ id: string }>(
      `select id from locations where brand_id = $1 and name = $2`,
      [brandId, location.name],
    );
    const locationId = existing.rows[0]
      ? (
          await one<{ id: string }>(
            db,
            `update locations set address = $2, format = $3, opening_date = $4
             where id = $1 returning id`,
            [existing.rows[0].id, JSON.stringify(location.address), location.format, location.opening_date],
          )
        ).id
      : (
          await one<{ id: string }>(
            db,
            `insert into locations (brand_id, name, address, format, opening_date)
             values ($1,$2,$3,$4,$5) returning id`,
            [brandId, location.name, JSON.stringify(location.address), location.format, location.opening_date],
          )
        ).id;
    locationIdByName.set(location.name, locationId);

    // Added, never rebuilt. The installed-sign record is the permanent history
    // a replacement request points at (line_items.replaces_sign_id), so a
    // re-seed must not delete rows out from under one — the FK is RESTRICT and
    // would refuse anyway. Use --reset to start a location over.
    for (const sign of location.installedSigns) {
      const brandItemId = itemIdByName.get(sign.brandItem);
      if (!brandItemId) throw new Error(`Unknown brand item "${sign.brandItem}"`);
      await db.query(
        `insert into installed_signs (location_id, brand_item_id, sizing, installed_at)
         select $1, $2, $3, $4
          where not exists (
            select 1 from installed_signs
             where location_id = $1 and brand_item_id = $2 and status = 'active'
          )`,
        [locationId, brandItemId, sign.sizing, sign.installed_at],
      );
    }
  }

  // ---- team allowlist
  for (const member of fb.teamMembers) {
    await db.query(
      `insert into team_members (email, name) values ($1,$2)
       on conflict (email) do update set name = excluded.name`,
      [member.email, member.name],
    );
  }

  return { brandId, itemIdByName, locationIdByName };
}
