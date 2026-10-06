// What the team's Brand signs table shows beside each sign (DECISIONS #180):
// the packages it is in, the engine's cost and margin behind a Studio price
// (team only — a brand never sees cost), and the sign's own history.
// SERVER ONLY.

import { query } from '../db/pool';
import { priceFromCost, resolveMargin } from '../pricing/margin';
import { listMarginRows } from '../pricing/margins';

export interface SignDetails {
  /** Store-type packages holding this sign, with how many of it each holds. */
  packages: { label: string; count: number }[];
  /** The engine quote behind a Studio price, and what today's margin would make it. */
  engine: { cost: number; marginPercent: number; price: number; priceToday: number | null; marginToday: number } | null;
  history: { id: string; summary: string; created_at: string }[];
}

export async function brandSignDetails(
  brandId: string,
  signs: readonly { id: string; sign_type: string; est_price: string | null; price_source: string }[],
): Promise<Map<string, SignDetails>> {
  const ids = signs.map((sign) => sign.id);
  const [packages, quotes, events, margins] = await Promise.all([
    query<{ id: string; label: string; count: string }>(
      `select e.id, p.label, count(*)::text as count
         from brand_packages p, jsonb_array_elements_text(p.items) as e(id)
        where p.brand_id = $1
        group by e.id, p.label
        order by p.label`,
      [brandId],
    ),
    // The quote that set each sign's price: the latest at that price, from a
    // brand admin's design (no order line), else the latest of any.
    query<{ brand_item_id: string; cost: string; margin_percent: string; price: string }>(
      `select distinct on (q.brand_item_id) q.brand_item_id, q.cost, q.margin_percent, q.price
         from engine_quotes q
         join brand_items bi on bi.id = q.brand_item_id
        where q.brand_item_id = any($1::uuid[]) and q.line_item_id is null
        order by q.brand_item_id, (q.price = bi.est_price) desc, q.created_at desc`,
      [ids],
    ),
    query<{ id: string; brand_item_id: string; summary: string; created_at: string }>(
      `select id, brand_item_id, summary, created_at from (
         select id, brand_item_id, summary, created_at,
                row_number() over (partition by brand_item_id order by created_at desc) as n
           from catalog_events
          where brand_item_id = any($1::uuid[])
       ) e where n <= 8
       order by created_at desc`,
      [ids],
    ),
    listMarginRows(),
  ]);

  const out = new Map<string, SignDetails>();
  for (const sign of signs) {
    const quote = sign.price_source === 'engine' ? quotes.find((q) => q.brand_item_id === sign.id) : undefined;
    let engine: SignDetails['engine'] = null;
    if (quote) {
      const margin = resolveMargin(margins, brandId, sign.sign_type);
      engine = {
        cost: Number(quote.cost),
        marginPercent: Number(quote.margin_percent),
        price: Number(quote.price),
        priceToday: priceFromCost(Number(quote.cost), margin.percent),
        marginToday: margin.percent,
      };
    }
    out.set(sign.id, {
      packages: packages.filter((p) => p.id === sign.id).map((p) => ({ label: p.label, count: Number(p.count) })),
      engine,
      history: events.filter((e) => e.brand_item_id === sign.id),
    });
  }
  return out;
}
