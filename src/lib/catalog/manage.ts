// The catalog, managed in the app (SPEC v2.4 §2.3).
//
// Both screens — the team's /admin/catalog and corporate's Signs tab — write
// through here, so the rules live in one place and neither page can drift:
//
//   · Signage.com sets every price. Nothing a brand role calls takes one.
//   · A brand admin's proposal is pending and inactive: every query that
//     already filters on `active` keeps it from franchisees untouched.
//   · A standin-priced master row never carries a price ("Custom quote").
//   · A retired sign leaves the brand's packages at once; installed signs and
//     past requests keep pointing at it.
//   · Every change writes a catalog_events row, as requests write
//     request_events.
//
// Callers authorize; this module assumes the caller may do what it asks. It
// takes brand ids from the caller's own access, never from the browser.

import { query, queryOne, transaction } from '../db/pool';
import { attributeLabel, summarize } from './labels';

export { attributeLabel, signStatus, summarize } from './labels';

import type { ReviewStatus } from './labels';

export type { ReviewStatus };

/** Who did it, as the history shows it. */
export interface CatalogActor {
  membershipId: string | null;
  label: string;
}

/** Where a sign type's price comes from (DECISIONS #179). */
export type PriceMode = 'studio' | 'fixed' | 'custom';

export const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  studio: 'Design Studio',
  fixed: 'Fixed price',
  custom: 'Custom quote',
};

export interface MasterRow {
  id: string;
  placement: 'indoor' | 'outdoor';
  category: string;
  sign_type: string;
  variant: string | null;
  pricing_type: string | null;
  pricing_basis: 'direct' | 'standin';
  price_mode: PriceMode;
  render_key: string | null;
  /** The team's uploaded icon for this sign type (#157). */
  icon_path: string | null;
  active: boolean;
  /** attribute → the option names a brand may lock. */
  options: Record<string, string[]>;
  /** How many brand signs are built on this row. */
  brand_items: number;
}

export interface ManagedSign {
  id: string;
  brand_id: string;
  brand_slug: string;
  brand_name: string;
  name: string;
  spec_summary: string | null;
  pinned_attributes: Record<string, unknown>;
  est_price: string | null;
  active: boolean;
  review_status: ReviewStatus;
  submission_note: string | null;
  review_note: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  sort_order: number;
  master_id: string;
  placement: 'indoor' | 'outdoor';
  category: string;
  sign_type: string;
  variant: string | null;
  pricing_basis: 'direct' | 'standin';
  price_mode: PriceMode;
  render_key: string | null;
  /** What shows: the sign's own picture, else its type's icon (#157). */
  image_path: string | null;
  /** The sign's own uploaded picture, if any. */
  thumbnail_url: string | null;
  /** Where est_price came from: the team, or the Design Studio engine (v2.6). */
  price_source: 'team' | 'engine';
  /** Has a Studio design: engine-priced, or a custom-quote sign the Studio draws. */
  designed: boolean;
  /** How many of the design's settings a franchisee may change (#201). */
  adjustable: number;
  /** Installed at stores: a reason to think twice before retiring. */
  installed: number;
}

export interface CatalogEvent {
  id: string;
  kind: string;
  actor_label: string;
  summary: string;
  created_at: string;
}

/** `Drive-thru (24h)` → `drive_thru_24h`: keys for store types and new options. */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Options that describe a sign's size rather than a choice a brand can lock. */
const NOT_LOCKABLE = new Set(['basic_fields']);

function optionsFrom(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [attribute, values] of Object.entries(raw as Record<string, unknown>)) {
    if (NOT_LOCKABLE.has(attribute) || !Array.isArray(values)) continue;
    const names = values
      .map((value) => (value && typeof value === 'object' ? (value as { name?: unknown }).name : null))
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    if (names.length > 0) out[attribute] = names;
  }
  return out;
}

// ------------------------------------------------------------------- reading

export async function listMasterCatalog(): Promise<MasterRow[]> {
  const rows = await query<Omit<MasterRow, 'options' | 'brand_items'> & {
    attribute_options: unknown;
    brand_items: string;
  }>(
    `select mc.id, mc.placement, mc.category, mc.sign_type, mc.variant, mc.pricing_type,
            mc.pricing_basis, mc.price_mode, mc.render_key, mc.icon_path, mc.active, mc.attribute_options,
            (select count(*) from brand_items bi where bi.master_catalog_id = mc.id) as brand_items
       from master_catalog mc
      order by mc.placement, mc.category, mc.sign_type, mc.variant nulls first`,
  );
  return rows.map(({ attribute_options, brand_items, ...row }) => ({
    ...row,
    options: optionsFrom(attribute_options),
    brand_items: Number(brand_items),
  }));
}

const SIGN_SQL = `
  select bi.id, bi.brand_id, b.slug as brand_slug, b.name as brand_name, bi.name,
         bi.spec_summary, bi.pinned_attributes, bi.est_price, bi.active, bi.review_status,
         bi.submission_note, bi.review_note, bi.submitted_at, bi.reviewed_at, bi.sort_order,
         coalesce(sp.name, sp.email) as submitted_by,
         mc.id as master_id, mc.placement, mc.category, mc.sign_type, mc.variant,
         mc.pricing_basis, mc.price_mode, mc.render_key, coalesce(bi.thumbnail_url, bi.design->>'mockupPath', mc.icon_path) as image_path, bi.thumbnail_url, bi.price_source,
         bi.design is not null as designed,
         -- Settings a franchisee may change: a rule exists only for those (#201).
         (select count(*)::int from jsonb_object_keys(coalesce(bi.design_rules, '{}'::jsonb))) as adjustable,
         (select count(*)::int from installed_signs s
           where s.brand_item_id = bi.id and s.status = 'active') as installed
    from brand_items bi
    join brands b on b.id = bi.brand_id
    join master_catalog mc on mc.id = bi.master_catalog_id
    left join memberships sm on sm.id = bi.submitted_by
    left join profiles sp on sp.id = sm.profile_id`;

/** Every sign a brand has — live, retired, pending, declined. */
export function listBrandSigns(brandId: string): Promise<ManagedSign[]> {
  return query<ManagedSign>(
    `${SIGN_SQL} where bi.brand_id = $1 order by bi.sort_order, bi.name`,
    [brandId],
  );
}

/** What waits on the team, across every brand, oldest first. */
export function listPendingSigns(): Promise<ManagedSign[]> {
  return query<ManagedSign>(
    `${SIGN_SQL} where bi.review_status = 'pending' order by bi.submitted_at nulls last`,
  );
}

export function getSign(itemId: string): Promise<ManagedSign | null> {
  return queryOne<ManagedSign>(`${SIGN_SQL} where bi.id = $1`, [itemId]);
}

export function catalogHistory(brandId: string | null, limit = 30): Promise<CatalogEvent[]> {
  return query<CatalogEvent>(
    `select id, kind, actor_label, summary, created_at from catalog_events
      where brand_id is not distinct from $1
      order by created_at desc limit $2`,
    [brandId, limit],
  );
}

// ------------------------------------------------------------------- writing

type Exec = { query: <R>(text: string, params?: unknown[]) => Promise<R[]> };

async function record(
  exec: Exec,
  event: {
    brandId: string | null;
    itemId?: string | null;
    masterId?: string | null;
    kind: string;
    actor: CatalogActor;
    summary: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await exec.query(
    `insert into catalog_events (brand_id, brand_item_id, master_catalog_id, kind,
                                 actor_membership_id, actor_label, summary, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      event.brandId,
      event.itemId ?? null,
      event.masterId ?? null,
      event.kind,
      event.actor.membershipId,
      event.actor.label,
      event.summary,
      JSON.stringify(event.detail ?? {}),
    ],
  );
}

/** A thrown error whose message is fit to show on the form. */
export class CatalogError extends Error {}

function friendly(error: unknown): never {
  if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
    throw new CatalogError('This brand already has a sign with that name.');
  }
  throw error;
}

/** Keep only choices the master row offers; anything else is dropped. */
function validPins(
  master: { attribute_options: unknown },
  pinned: Record<string, string>,
): Record<string, string> {
  const options = optionsFrom(master.attribute_options);
  const out: Record<string, string> = {};
  for (const [attribute, value] of Object.entries(pinned)) {
    if (value && options[attribute]?.includes(value)) out[attribute] = value;
  }
  return out;
}

export interface Proposal {
  masterId: string;
  name: string;
  pinned: Record<string, string>;
  note: string | null;
}

async function activeMaster(masterId: string) {
  const master = await queryOne<{ id: string; sign_type: string; attribute_options: unknown }>(
    `select id, sign_type, attribute_options from master_catalog where id = $1 and active`,
    [masterId],
  );
  if (!master) throw new CatalogError('That sign type is no longer in the Signage.com catalog.');
  return master;
}

/** A brand admin proposes a new sign: pending, inactive, unpriced. */
export async function proposeSign(
  brandId: string,
  actor: CatalogActor,
  proposal: Proposal,
): Promise<string> {
  const name = proposal.name.trim();
  if (!name) throw new CatalogError('Give the sign a name.');
  const master = await activeMaster(proposal.masterId);
  const pinned = validPins(master, proposal.pinned);

  return transaction(async (exec) => {
    const [row] = await exec
      .query<{ id: string }>(
        `insert into brand_items (brand_id, master_catalog_id, name, pinned_attributes,
                                  spec_summary, est_price, active, review_status, sort_order,
                                  submitted_by, submitted_at, submission_note)
         values ($1,$2,$3,$4,$5,null,false,'pending',
                 (select coalesce(max(sort_order), 0) + 1 from brand_items where brand_id = $1),
                 $6, now(), $7)
         returning id`,
        [
          brandId,
          master.id,
          name,
          JSON.stringify(pinned),
          summarize(pinned),
          actor.membershipId,
          proposal.note?.trim() || null,
        ],
      )
      .catch(friendly);
    await record(exec, {
      brandId,
      itemId: row.id,
      masterId: master.id,
      kind: 'sign_proposed',
      actor,
      summary: `${actor.label} proposed ${name} (${master.sign_type})`,
      detail: { pinned },
    });
    return row.id;
  });
}

/** A brand admin revises a pending or declined proposal; a declined one goes back to the team. */
export async function reviseSign(
  brandId: string,
  itemId: string,
  actor: CatalogActor,
  proposal: Proposal,
): Promise<void> {
  const name = proposal.name.trim();
  if (!name) throw new CatalogError('Give the sign a name.');
  const master = await activeMaster(proposal.masterId);
  const pinned = validPins(master, proposal.pinned);

  await transaction(async (exec) => {
    const updated = await exec
      .query<{ id: string }>(
        `update brand_items
            set master_catalog_id = $3, name = $4, pinned_attributes = $5, spec_summary = $6,
                submission_note = $7, review_status = 'pending', submitted_by = $8,
                submitted_at = now(), reviewed_by = null, reviewed_at = null
          where id = $1 and brand_id = $2 and review_status in ('pending', 'declined')
          returning id`,
        [
          itemId,
          brandId,
          master.id,
          name,
          JSON.stringify(pinned),
          summarize(pinned),
          proposal.note?.trim() || null,
          actor.membershipId,
        ],
      )
      .catch(friendly);
    if (updated.length === 0) throw new CatalogError('Only a sign still under review can be changed.');
    await record(exec, {
      brandId,
      itemId,
      masterId: master.id,
      kind: 'sign_revised',
      actor,
      summary: `${actor.label} revised ${name} and sent it for review`,
      detail: { pinned },
    });
  });
}

/** A brand admin withdraws a proposal the team has not approved. */
export async function withdrawSign(brandId: string, itemId: string, actor: CatalogActor): Promise<void> {
  await transaction(async (exec) => {
    const [row] = await exec.query<{ name: string }>(
      `delete from brand_items
        where id = $1 and brand_id = $2 and review_status in ('pending', 'declined')
          and not exists (select 1 from line_items li where li.brand_item_id = brand_items.id)
        returning name`,
      [itemId, brandId],
    );
    if (!row) throw new CatalogError('Only a sign that was never approved can be withdrawn.');
    await record(exec, {
      brandId,
      kind: 'sign_withdrawn',
      actor,
      summary: `${actor.label} withdrew the proposal for ${row.name}`,
    });
  });
}

function priceFor(pricingBasis: 'direct' | 'standin', price: number | null): number | null {
  if (pricingBasis === 'standin') return null;
  if (price === null) return null;
  if (!Number.isFinite(price) || price < 0) throw new CatalogError('Enter a price of zero or more.');
  return Math.round(price * 100) / 100;
}

const money = (price: number | null) =>
  price === null ? 'Custom quote' : `$${price.toLocaleString('en-US')}`;

/** The team approves a proposal: it goes live, at the price the team sets. */
export async function approveSign(
  itemId: string,
  actor: CatalogActor,
  decision: { name: string; specSummary: string | null; price: number | null; note: string | null },
): Promise<void> {
  const sign = await getSign(itemId);
  if (!sign || sign.review_status !== 'pending') throw new CatalogError('That sign is not waiting for review.');
  const name = decision.name.trim();
  if (!name) throw new CatalogError('The sign needs a name.');
  if (sign.price_mode === 'fixed' && decision.price === null) {
    throw new CatalogError('Enter the fixed price for this sign before approving it.');
  }
  const price = priceFor(sign.pricing_basis, decision.price);

  await transaction(async (exec) => {
    await exec
      .query(
        `update brand_items
            set name = $2, spec_summary = $3, est_price = $4, review_note = $5,
                review_status = 'approved', active = true, reviewed_by = $6, reviewed_at = now()
          where id = $1`,
        [itemId, name, decision.specSummary?.trim() || null, price, decision.note?.trim() || null, actor.membershipId],
      )
      .catch(friendly);
    await record(exec, {
      brandId: sign.brand_id,
      itemId,
      kind: 'sign_approved',
      actor,
      summary: `${actor.label} approved ${name} at ${money(price)}; it is now live`,
      detail: { price, renamed: name !== sign.name ? { from: sign.name } : undefined },
    });
  });
}

export async function declineSign(itemId: string, actor: CatalogActor, note: string): Promise<void> {
  if (!note.trim()) throw new CatalogError('Say why, so the brand can revise it.');
  const sign = await getSign(itemId);
  if (!sign || sign.review_status !== 'pending') throw new CatalogError('That sign is not waiting for review.');
  await transaction(async (exec) => {
    await exec.query(
      `update brand_items set review_status = 'declined', review_note = $2,
              reviewed_by = $3, reviewed_at = now()
        where id = $1`,
      [itemId, note.trim(), actor.membershipId],
    );
    await record(exec, {
      brandId: sign.brand_id,
      itemId,
      kind: 'sign_declined',
      actor,
      summary: `${actor.label} declined ${sign.name}: ${note.trim()}`,
    });
  });
}

/**
 * Retire or reinstate a live sign. Retiring takes it out of every package of
 * the brand at once — a package holds only live signs (§2.3) — and reinstating
 * does not put it back: that is the brand's package decision to make again.
 */
export async function setSignActive(
  brandId: string,
  itemId: string,
  actor: CatalogActor,
  active: boolean,
): Promise<void> {
  await transaction(async (exec) => {
    const [row] = await exec.query<{ name: string }>(
      `update brand_items set active = $3
        where id = $1 and brand_id = $2 and review_status = 'approved' and active <> $3
        returning name`,
      [itemId, brandId, active],
    );
    if (!row) throw new CatalogError(active ? 'That sign is already live.' : 'That sign is already retired.');

    let packages: string[] = [];
    if (!active) {
      const touched = await exec.query<{ label: string }>(
        `update brand_packages
            set items = coalesce((select jsonb_agg(e order by n)
                                    from jsonb_array_elements(items) with ordinality as t(e, n)
                                   where e <> to_jsonb($2::text)), '[]'::jsonb)
          where brand_id = $1 and items @> jsonb_build_array($2::text)
          returning label`,
        [brandId, itemId],
      );
      packages = touched.map((pkg) => pkg.label);
    }
    await record(exec, {
      brandId,
      itemId,
      kind: active ? 'sign_reinstated' : 'sign_retired',
      actor,
      summary: active
        ? `${actor.label} reinstated ${row.name}`
        : `${actor.label} retired ${row.name}` +
          (packages.length ? `, and took it out of ${packages.join(', ')}` : ''),
      detail: packages.length ? { packages } : {},
    });
  });
}

/** The team changes a live sign's price. Past requests keep their snapshot. */
export async function setSignPrice(itemId: string, actor: CatalogActor, price: number | null): Promise<void> {
  const sign = await getSign(itemId);
  if (!sign || sign.review_status !== 'approved') throw new CatalogError('Only an approved sign has a price.');
  const next = priceFor(sign.pricing_basis, price);
  if (sign.pricing_basis === 'standin' && price !== null) {
    throw new CatalogError('This sign type has no pricing model yet, so it is always a custom quote.');
  }
  if (sign.price_mode === 'fixed' && price === null) {
    throw new CatalogError(
      'A fixed-price sign needs a price. To quote it per order instead, set its type to Custom quote in the catalog.',
    );
  }
  await transaction(async (exec) => {
    await exec.query(`update brand_items set est_price = $2 where id = $1`, [itemId, next]);
    await record(exec, {
      brandId: sign.brand_id,
      itemId,
      kind: 'sign_priced',
      actor,
      summary: `${actor.label} changed ${sign.name} from ${money(sign.est_price === null ? null : Number(sign.est_price))} to ${money(next)}`,
      detail: { from: sign.est_price, to: next },
    });
  });
}

/** The team switches a master row on or off. Brand signs already built on it stay as they are. */
export async function setMasterActive(masterId: string, actor: CatalogActor, active: boolean): Promise<void> {
  await transaction(async (exec) => {
    const [row] = await exec.query<{ sign_type: string; variant: string | null }>(
      `update master_catalog set active = $2 where id = $1 and active <> $2
        returning sign_type, variant`,
      [masterId, active],
    );
    if (!row) return;
    const name = row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
    await record(exec, {
      brandId: null,
      masterId,
      kind: active ? 'master_enabled' : 'master_disabled',
      actor,
      summary: `${actor.label} ${active ? 'switched on' : 'switched off'} ${name}`,
    });
  });
}

/**
 * The team chooses where a sign type's price comes from (DECISIONS #179).
 * Its brand signs follow: to a custom quote, their prices are cleared (the
 * team prices each order); to a fixed price, the price they have is kept as
 * the starting figure for the team to confirm; to the Studio, a brand admin's
 * next design save prices them. Requests already made keep their snapshot.
 */
export async function setMasterPriceMode(masterId: string, actor: CatalogActor, mode: PriceMode): Promise<void> {
  if (!['studio', 'fixed', 'custom'].includes(mode)) throw new CatalogError('Choose where the price comes from.');
  await transaction(async (exec) => {
    const [row] = await exec.query<{ sign_type: string; variant: string | null; was: PriceMode }>(
      `update master_catalog mc
          set price_mode = $2, pricing_basis = case when $2 = 'custom' then 'standin' else 'direct' end::pricing_basis
         from (select price_mode as was from master_catalog where id = $1) prior
        where mc.id = $1 and mc.price_mode <> $2
        returning mc.sign_type, mc.variant, prior.was`,
      [masterId, mode],
    );
    if (!row) return;
    if (mode === 'custom') {
      await exec.query(
        `update brand_items set est_price = null, price_source = 'team' where master_catalog_id = $1`,
        [masterId],
      );
    } else if (mode === 'fixed') {
      await exec.query(`update brand_items set price_source = 'team' where master_catalog_id = $1`, [masterId]);
    }
    const name = row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
    await record(exec, {
      brandId: null,
      masterId,
      kind: 'price_mode_set',
      actor,
      summary: `${actor.label} set ${name} to price from ${PRICE_MODE_LABEL[mode]} (was ${PRICE_MODE_LABEL[row.was]})`,
      detail: { from: row.was, to: mode },
    });
  });
}

export interface NewVariant {
  placement: 'indoor' | 'outdoor';
  category: string;
  signType: string;
  variant: string | null;
  pricingBasis: 'direct' | 'standin';
  renderKey: string | null;
}

/**
 * The team adds a sign type or variant. When the sign type already exists, the
 * new row starts with its options and pricing model, so a new finish of
 * channel letters offers what channel letters offer.
 */
export async function addMasterVariant(actor: CatalogActor, input: NewVariant): Promise<string> {
  const category = input.category.trim();
  const signType = input.signType.trim();
  const variant = input.variant?.trim() || null;
  if (!category || !signType) throw new CatalogError('A category and a sign type are required.');

  return transaction(async (exec) => {
    const [sibling] = await exec.query<{ attribute_options: unknown; pricing_type: string | null }>(
      `select attribute_options, pricing_type from master_catalog
        where placement = $1 and sign_type = $2 order by created_at limit 1`,
      [input.placement, signType],
    );
    const [row] = await exec
      .query<{ id: string }>(
        `insert into master_catalog (placement, category, sign_type, variant, attribute_options,
                                     pricing_type, pricing_basis, render_key, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true) returning id`,
        [
          input.placement,
          category,
          signType,
          variant,
          JSON.stringify(sibling?.attribute_options ?? {}),
          sibling?.pricing_type ?? null,
          input.pricingBasis,
          input.renderKey?.trim() || null,
        ],
      )
      .catch((error) => {
        if ((error as { code?: string }).code === '23505') {
          throw new CatalogError('That sign type and variant is already in the catalog.');
        }
        throw error;
      });
    await record(exec, {
      brandId: null,
      masterId: row.id,
      kind: 'master_added',
      actor,
      summary: `${actor.label} added ${variant ? `${signType} — ${variant}` : signType} (${input.placement})`,
    });
    return row.id;
  });
}

// ------------------------------------------------------------------ packages

/** A store type's key: the brand's own list (DECISIONS #156). */
export type PackageFormat = string;

export interface StoreType {
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  /** Stores set up as this type: why a type is retired, never deleted. */
  locations: number;
}

export function listStoreTypes(brandId: string): Promise<StoreType[]> {
  return query<StoreType>(
    `select t.key, t.label, t.description, t.sort_order, t.active,
            (select count(*)::int from locations l where l.brand_id = t.brand_id and l.format = t.key) as locations
       from brand_store_types t
      where t.brand_id = $1
      order by t.active desc, t.sort_order, t.label`,
    [brandId],
  );
}

/**
 * A brand admin adds a store type — "Drive-thru" — and its empty package, so
 * the next thing to do is fill it. The key is derived from the name once and
 * never changes: it is on every store of the type and in document URLs.
 */
export async function addStoreType(
  brandId: string,
  actor: CatalogActor,
  input: { label: string; description: string | null },
): Promise<string> {
  const label = input.label.trim();
  if (!label) throw new CatalogError('Name the store type.');
  const base = slug(label).slice(0, 36) || 'store';

  return transaction(async (exec) => {
    const taken = new Set(
      (await exec.query<{ key: string }>(`select key from brand_store_types where brand_id = $1`, [brandId])).map(
        (row) => row.key,
      ),
    );
    const labels = await exec.query<{ n: string }>(
      `select count(*) as n from brand_store_types where brand_id = $1 and lower(label) = lower($2)`,
      [brandId, label],
    );
    if (Number(labels[0].n) > 0) throw new CatalogError(`There is already a store type called ${label}.`);
    let key = /^[a-z0-9]/.test(base) ? base : `t_${base}`;
    for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;

    await exec.query(
      `insert into brand_store_types (brand_id, key, label, description, sort_order)
       values ($1, $2, $3, $4,
               (select coalesce(max(sort_order), 0) + 1 from brand_store_types where brand_id = $1))`,
      [brandId, key, label, input.description?.trim() || null],
    );
    await exec.query(
      `insert into brand_packages (brand_id, format, label, description, items)
       values ($1, $2, $3, $4, '[]'::jsonb)`,
      [brandId, key, label, input.description?.trim() || null],
    );
    await record(exec, {
      brandId,
      kind: 'store_type_added',
      actor,
      summary: `${actor.label} added the store type ${label}`,
      detail: { key },
    });
    return key;
  });
}

export async function updateStoreType(
  brandId: string,
  key: string,
  actor: CatalogActor,
  input: { label: string; description: string | null },
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new CatalogError('Name the store type.');
  await transaction(async (exec) => {
    const clash = await exec.query<{ key: string }>(
      `select key from brand_store_types where brand_id = $1 and lower(label) = lower($2) and key <> $3`,
      [brandId, label, key],
    );
    if (clash.length > 0) throw new CatalogError(`There is already a store type called ${label}.`);
    const [before] = await exec.query<{ label: string }>(
      `select label from brand_store_types where brand_id = $1 and key = $2`,
      [brandId, key],
    );
    if (!before) throw new CatalogError('That store type no longer exists.');
    await exec.query(
      `update brand_store_types set label = $3, description = $4 where brand_id = $1 and key = $2`,
      [brandId, key, label, input.description?.trim() || null],
    );
    await record(exec, {
      brandId,
      kind: 'store_type_updated',
      actor,
      summary:
        before.label === label
          ? `${actor.label} edited the ${label} store type`
          : `${actor.label} renamed the store type ${before.label} to ${label}`,
    });
  });
}

/**
 * Retire or bring back a store type. A retired type is not offered when a new
 * store is set up, and has no budget sheet; stores already of that type keep
 * it. The last live type cannot be retired — setup would have nothing to offer.
 */
export async function setStoreTypeActive(
  brandId: string,
  key: string,
  actor: CatalogActor,
  active: boolean,
): Promise<void> {
  await transaction(async (exec) => {
    if (!active) {
      const [live] = await exec.query<{ n: string }>(
        `select count(*) as n from brand_store_types where brand_id = $1 and active`,
        [brandId],
      );
      if (Number(live.n) <= 1) throw new CatalogError('Keep at least one store type, or new stores cannot be set up.');
    }
    const [row] = await exec.query<{ label: string }>(
      `update brand_store_types set active = $3 where brand_id = $1 and key = $2 and active <> $3 returning label`,
      [brandId, key, active],
    );
    if (!row) return;
    await record(exec, {
      brandId,
      kind: active ? 'store_type_reinstated' : 'store_type_retired',
      actor,
      summary: `${actor.label} ${active ? 'brought back' : 'retired'} the store type ${row.label}`,
    });
  });
}

/** Move a store type up or down the list setup shows. */
export async function moveStoreType(brandId: string, key: string, direction: -1 | 1): Promise<void> {
  await transaction(async (exec) => {
    const types = await exec.query<{ key: string; sort_order: number }>(
      `select key, sort_order from brand_store_types where brand_id = $1 and active
        order by sort_order, label for update`,
      [brandId],
    );
    const index = types.findIndex((t) => t.key === key);
    const other = types[index + direction];
    if (index < 0 || !other) return;
    // Renumber the whole list, so ties from earlier inserts cannot stall a move.
    const order = types.map((t) => t.key);
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    for (const [n, k] of order.entries()) {
      await exec.query(`update brand_store_types set sort_order = $3 where brand_id = $1 and key = $2`, [
        brandId,
        k,
        n + 1,
      ]);
    }
  });
}

export interface ManagedPackage {
  format: PackageFormat;
  label: string;
  description: string | null;
  /** Ordered brand item ids; a repeat is a second of the same sign. */
  items: string[];
}

export function listBrandPackages(brandId: string): Promise<ManagedPackage[]> {
  return query<ManagedPackage>(
    `select format, label, description, items from brand_packages
      where brand_id = $1`,
    [brandId],
  );
}

/**
 * A brand admin saves one format's package — live at once (SPEC v2.4 §2.3).
 * Every item must be one of the brand's own live signs. Requests already
 * submitted are untouched: their line items were written when they were made.
 */
export async function savePackage(
  brandId: string,
  actor: CatalogActor,
  input: { format: PackageFormat; label: string; description: string | null; items: string[] },
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new CatalogError('Give the package a name.');
  const storeType = await queryOne<{ key: string }>(
    `select key from brand_store_types where brand_id = $1 and key = $2 and active`,
    [brandId, input.format],
  );
  if (!storeType) throw new CatalogError('That store type is not one of yours, or it was retired.');
  if (input.items.length > 100) throw new CatalogError('That is more signs than a package can hold.');
  if (input.items.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new CatalogError('A package can only hold your live signs. Reload and try again.');
  }

  const live = await query<{ id: string; name: string }>(
    `select id, name from brand_items
      where brand_id = $1 and active and review_status = 'approved' and id = any($2::uuid[])`,
    [brandId, [...new Set(input.items)]],
  );
  const names = new Map(live.map((row) => [row.id, row.name]));
  if (input.items.some((id) => !names.has(id))) {
    throw new CatalogError('A package can only hold your live signs. Reload and try again.');
  }

  await transaction(async (exec) => {
    const [before] = await exec.query<{ items: string[] }>(
      `select items from brand_packages where brand_id = $1 and format = $2 for update`,
      [brandId, input.format],
    );
    await exec.query(
      `insert into brand_packages (brand_id, format, label, description, items)
       values ($1,$2,$3,$4,$5)
       on conflict (brand_id, format)
       do update set label = excluded.label, description = excluded.description, items = excluded.items`,
      [brandId, input.format, label, input.description?.trim() || null, JSON.stringify(input.items)],
    );

    // What changed, by name and count, for the history.
    const count = (ids: string[]) => ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
    const was = count(before?.items ?? []);
    const now = count(input.items);
    const changes: string[] = [];
    for (const id of new Set([...was.keys(), ...now.keys()])) {
      const delta = (now.get(id) ?? 0) - (was.get(id) ?? 0);
      if (delta === 0) continue;
      const name = names.get(id) ?? 'a retired sign';
      changes.push(delta > 0 ? `added ${delta > 1 ? `${delta}× ` : ''}${name}` : `removed ${-delta > 1 ? `${-delta}× ` : ''}${name}`);
    }
    await record(exec, {
      brandId,
      kind: before ? 'package_updated' : 'package_created',
      actor,
      summary:
        `${actor.label} ${before ? 'updated' : 'created'} the ${label} package` +
        (changes.length ? `: ${changes.join(', ')}` : ''),
      detail: { format: input.format, items: input.items },
    });
  });
}

// ------------------------------------------------------ master row options

/**
 * The team edits which choices a master row offers (SPEC v2.4 §2.3): the
 * lists a brand admin locks from. Options kept by name keep their engine
 * `var_name` and `value`; new ones get a derived `var_name`, which the pricing
 * engine does not know until Design Studio is kept in step (§8). Sizing fields
 * (`basic_fields`) are the engine's, not a choice, and are left as they are.
 * Brand signs that already locked a value that is removed keep it.
 */
export async function updateMasterOptions(
  masterId: string,
  actor: CatalogActor,
  options: Record<string, string[]>,
  renderKey: string | null,
): Promise<void> {
  const cleaned: Record<string, string[]> = {};
  for (const [rawAttribute, values] of Object.entries(options)) {
    const attribute = slug(rawAttribute);
    if (!attribute || NOT_LOCKABLE.has(attribute)) continue;
    const names = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    if (names.length > 0) cleaned[attribute] = names;
  }

  await transaction(async (exec) => {
    const [row] = await exec.query<{ attribute_options: Record<string, unknown> | null; sign_type: string; variant: string | null }>(
      `select attribute_options, sign_type, variant from master_catalog where id = $1 for update`,
      [masterId],
    );
    if (!row) throw new CatalogError('That catalog row no longer exists.');
    const before = (row.attribute_options ?? {}) as Record<string, { var_name?: string; name?: string; value?: string }[]>;

    const next: Record<string, unknown> = {};
    for (const attribute of NOT_LOCKABLE) if (before[attribute]) next[attribute] = before[attribute];
    for (const [attribute, names] of Object.entries(cleaned)) {
      const existing = Array.isArray(before[attribute]) ? before[attribute] : [];
      next[attribute] = names.map(
        (name) =>
          existing.find((option) => option?.name === name) ?? {
            var_name: `${attribute}_${slug(name)}`,
            name,
            value: name,
          },
      );
    }

    await exec.query(`update master_catalog set attribute_options = $2, render_key = $3 where id = $1`, [
      masterId,
      JSON.stringify(next),
      renderKey?.trim() || null,
    ]);
    const was = optionsFrom(before);
    const changes: string[] = [];
    for (const attribute of new Set([...Object.keys(was), ...Object.keys(cleaned)])) {
      const a = new Set(was[attribute] ?? []);
      const b = new Set(cleaned[attribute] ?? []);
      const added = [...b].filter((x) => !a.has(x));
      const removed = [...a].filter((x) => !b.has(x));
      if (added.length) changes.push(`${attributeLabel(attribute)} +${added.join(', +')}`);
      if (removed.length) changes.push(`${attributeLabel(attribute)} −${removed.join(', −')}`);
    }
    const name = row.variant ? `${row.sign_type} — ${row.variant}` : row.sign_type;
    await record(exec, {
      brandId: null,
      masterId,
      kind: 'master_options_updated',
      actor,
      summary: `${actor.label} edited ${name}` + (changes.length ? `: ${changes.join('; ')}` : ''),
    });
  });
}

// ------------------------------------------------------------ sign pictures

/**
 * A brand sign's own picture (#157), or none to fall back to its type's icon.
 * Scoped to the brand: the caller passes the brand from its own access.
 */
export async function setSignImage(
  brandId: string,
  itemId: string,
  actor: CatalogActor,
  path: string | null,
): Promise<void> {
  await transaction(async (exec) => {
    const [row] = await exec.query<{ name: string }>(
      `update brand_items set thumbnail_url = $3 where id = $1 and brand_id = $2 returning name`,
      [itemId, brandId, path],
    );
    if (!row) throw new CatalogError('That sign no longer exists.');
    await record(exec, {
      brandId,
      itemId,
      kind: path ? 'sign_image_set' : 'sign_image_removed',
      actor,
      summary: `${actor.label} ${path ? 'uploaded a picture for' : 'removed the picture from'} ${row.name}`,
    });
  });
}

/**
 * The team's icon for a sign type (#157): set on every row of that type at that
 * placement, since the catalog shows a type once with its variants beneath.
 */
export async function setSignTypeIcon(masterId: string, actor: CatalogActor, path: string | null): Promise<void> {
  await transaction(async (exec) => {
    const [row] = await exec.query<{ placement: string; sign_type: string }>(
      `select placement, sign_type from master_catalog where id = $1`,
      [masterId],
    );
    if (!row) throw new CatalogError('That catalog row no longer exists.');
    await exec.query(`update master_catalog set icon_path = $3 where placement = $1 and sign_type = $2`, [
      row.placement,
      row.sign_type,
      path,
    ]);
    await record(exec, {
      brandId: null,
      masterId,
      kind: path ? 'master_icon_set' : 'master_icon_removed',
      actor,
      summary: `${actor.label} ${path ? 'uploaded an icon for' : 'removed the icon from'} ${row.sign_type} (${row.placement})`,
    });
  });
}
