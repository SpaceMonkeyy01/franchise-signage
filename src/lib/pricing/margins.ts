// Reading and setting Signage.com's margins (SPEC v2.6 §8, DECISIONS #165).
// Team only: no brand role ever reads these, and each change is logged to
// catalog_events WITHOUT a brand_id, which brand roles cannot read.

import type { CatalogActor } from '../catalog/manage';
import { query, transaction } from '../db/pool';
import { FALLBACK_MARGIN_PERCENT, type MarginRow } from './margin';

export class MarginError extends Error {}

export interface BrandMargins {
  id: string;
  name: string;
  /** Whether the team confirms each Signage.com quote before it is delivered (DECISIONS #172). */
  teamConfirmsQuotes: boolean;
  /** The brand's own default, or null when it uses the platform's. */
  brandPercent: number | null;
  /** Every sign type the master catalog prices, with the brand's margin for it if set. */
  signTypes: { signType: string; percent: number | null; inUse: number }[];
}

export interface MarginOverview {
  platformPercent: number;
  brands: BrandMargins[];
}

export async function listMarginRows(): Promise<MarginRow[]> {
  return query<MarginRow>(`select brand_id, sign_type, margin_percent from pricing_margins`);
}

/**
 * Every brand with its margins, and every sign type the engine can price —
 * standin types are priced by hand, so a margin on them would mean nothing.
 * `inUse` counts the brand's active signs of that type, to show the ones that
 * matter first.
 */
export async function marginOverview(): Promise<MarginOverview> {
  const [rows, brands, types, usage] = await Promise.all([
    listMarginRows(),
    query<{ id: string; name: string; team_confirms_quotes: boolean }>(
      `select id, name, team_confirms_quotes from brands order by name`,
    ),
    query<{ sign_type: string }>(
      `select distinct sign_type from master_catalog
        where active and pricing_basis = 'direct' order by sign_type`,
    ),
    query<{ brand_id: string; sign_type: string; n: string }>(
      `select bi.brand_id, mc.sign_type, count(*)::text as n
         from brand_items bi join master_catalog mc on mc.id = bi.master_catalog_id
        where bi.active group by 1, 2`,
    ),
  ]);
  const value = (brand: string | null, type: string | null) => {
    const row = rows.find((r) => r.brand_id === brand && r.sign_type === type);
    return row ? Number(row.margin_percent) : null;
  };
  return {
    platformPercent: value(null, null) ?? FALLBACK_MARGIN_PERCENT,
    brands: brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      teamConfirmsQuotes: brand.team_confirms_quotes,
      brandPercent: value(brand.id, null),
      signTypes: types
        .map(({ sign_type }) => ({
          signType: sign_type,
          percent: value(brand.id, sign_type),
          inUse: Number(usage.find((u) => u.brand_id === brand.id && u.sign_type === sign_type)?.n ?? 0),
        }))
        .sort((a, b) => Number(b.inUse > 0) - Number(a.inUse > 0) || a.signType.localeCompare(b.signType)),
    })),
  };
}

/**
 * Set one margin, or clear it (null) so the level beneath applies. The
 * platform default can be changed but never cleared.
 */
export async function setMargin(
  actor: CatalogActor,
  scope: { brandId: string | null; signType: string | null },
  percent: number | null,
): Promise<void> {
  if (scope.signType && !scope.brandId) throw new MarginError('A sign-type margin belongs to a brand.');
  if (!scope.brandId && percent === null) throw new MarginError('The standard margin cannot be empty.');

  await transaction(async (exec) => {
    const [brand] = scope.brandId
      ? await exec.query<{ name: string }>(`select name from brands where id = $1`, [scope.brandId])
      : [{ name: '' }];
    if (!brand) throw new MarginError('That brand no longer exists.');

    const [before] = await exec.query<{ margin_percent: string }>(
      `select margin_percent from pricing_margins
        where brand_id is not distinct from $1 and sign_type is not distinct from $2`,
      [scope.brandId, scope.signType],
    );
    const from = before ? Number(before.margin_percent) : null;
    if (from === percent) return;

    if (percent === null) {
      await exec.query(
        `delete from pricing_margins
          where brand_id is not distinct from $1 and sign_type is not distinct from $2`,
        [scope.brandId, scope.signType],
      );
    } else if (before) {
      await exec.query(
        `update pricing_margins set margin_percent = $3, updated_at = now()
          where brand_id is not distinct from $1 and sign_type is not distinct from $2`,
        [scope.brandId, scope.signType, percent],
      );
    } else {
      await exec.query(
        `insert into pricing_margins (brand_id, sign_type, margin_percent) values ($1, $2, $3)`,
        [scope.brandId, scope.signType, percent],
      );
    }

    const what = !scope.brandId
      ? 'the standard margin'
      : scope.signType
        ? `${brand.name}'s margin on ${scope.signType}`
        : `${brand.name}'s margin`;
    const show = (p: number | null) => (p === null ? 'the default' : `${p}%`);
    // brand_id stays null on purpose: brand roles can read their brand's
    // catalog_events, and a margin is never theirs to see.
    await exec.query(
      `insert into catalog_events (brand_id, kind, actor_membership_id, actor_label, summary, detail)
       values (null, 'margin_set', $1, $2, $3, $4)`,
      [
        actor.membershipId,
        actor.label,
        `${actor.label} changed ${what} from ${show(from)} to ${show(percent)}`,
        JSON.stringify({ brandId: scope.brandId, signType: scope.signType, from, to: percent }),
      ],
    );
  });
}

/**
 * Turn the team's confirmation of a brand's quotes on or off (SPEC v2.6 §8
 * point 5, DECISIONS #172). Logged beside the margins, without a brand_id: it
 * is Signage.com's call about its own pricing, not the brand's.
 */
export async function setQuoteConfirmation(
  actor: CatalogActor,
  brandId: string,
  teamConfirms: boolean,
): Promise<void> {
  await transaction(async (exec) => {
    const [brand] = await exec.query<{ name: string; team_confirms_quotes: boolean }>(
      `select name, team_confirms_quotes from brands where id = $1`,
      [brandId],
    );
    if (!brand) throw new MarginError('That brand no longer exists.');
    if (brand.team_confirms_quotes === teamConfirms) return;

    await exec.query(`update brands set team_confirms_quotes = $2 where id = $1`, [brandId, teamConfirms]);
    await exec.query(
      `insert into catalog_events (brand_id, kind, actor_membership_id, actor_label, summary, detail)
       values (null, 'quote_confirmation_set', $1, $2, $3, $4)`,
      [
        actor.membershipId,
        actor.label,
        teamConfirms
          ? `${actor.label} turned team confirmation of quotes back on for ${brand.name}`
          : `${actor.label} turned off team confirmation of quotes for ${brand.name}`,
        JSON.stringify({ brandId, teamConfirms }),
      ],
    );
  });
}
