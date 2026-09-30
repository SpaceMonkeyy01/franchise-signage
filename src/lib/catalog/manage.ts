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
import { summarize } from './labels';

export { attributeLabel, signStatus, summarize } from './labels';

import type { ReviewStatus } from './labels';

export type { ReviewStatus };

/** Who did it, as the history shows it. */
export interface CatalogActor {
  membershipId: string | null;
  label: string;
}

export interface MasterRow {
  id: string;
  placement: 'indoor' | 'outdoor';
  category: string;
  sign_type: string;
  variant: string | null;
  pricing_type: string | null;
  pricing_basis: 'direct' | 'standin';
  render_key: string | null;
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
  render_key: string | null;
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
            mc.pricing_basis, mc.render_key, mc.active, mc.attribute_options,
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
         mc.pricing_basis, mc.render_key,
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
