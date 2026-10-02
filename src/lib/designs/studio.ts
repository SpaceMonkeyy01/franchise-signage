// The Design Studio's server side (SPEC v2.6 §8, DECISIONS #166): price a
// design through the Signize engine, apply Signage.com's margin, keep the
// mockup in our storage, and save a brand sign's design and rules.
//
// SERVER ONLY. Signize's cost goes into engine_quotes (team only) and nowhere
// else; what returns to a page is our price.

import type { CatalogActor } from '../catalog/manage';
import { query, queryOne, transaction } from '../db/pool';
import { priceFromCost, resolveMargin } from '../pricing/margin';
import { listMarginRows } from '../pricing/margins';
import { EngineRejectedError, EngineUnavailableError, priceDesign, type AllowedOptions } from '../signize/client';
import { getUpload, putUpload } from '../storage';
import { defaultRules, designSummary, validRules, type DesignRules, type SignDesign } from './design';

export class StudioError extends Error {}

export interface DesignableSign {
  id: string;
  brand_id: string;
  brand_slug: string;
  name: string;
  review_status: string;
  sign_type: string;
  pricing_type: string | null;
  pricing_basis: 'direct' | 'standin';
  attribute_options: AllowedOptions;
  design: SignDesign | null;
  design_rules: DesignRules;
  pinned_attributes: Record<string, unknown>;
  est_price: string | null;
}

export async function getDesignableSign(itemId: string, brandId: string): Promise<DesignableSign | null> {
  return queryOne<DesignableSign>(
    `select bi.id, bi.brand_id, b.slug as brand_slug, bi.name, bi.review_status,
            mc.sign_type, mc.pricing_type, mc.pricing_basis, mc.attribute_options,
            bi.design, bi.design_rules, bi.pinned_attributes, bi.est_price
       from brand_items bi
       join brands b on b.id = bi.brand_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where bi.id = $1 and bi.brand_id = $2`,
    [itemId, brandId],
  );
}

/** The options a sign type offers, without the engine's bookkeeping fields. */
export function offeredOptions(sign: Pick<DesignableSign, 'attribute_options'>): AllowedOptions {
  const skip = new Set(['basic_fields', 'avg_char_height', 'depth_range', 'ul_required', 'char_height_band']);
  return Object.fromEntries(
    Object.entries(sign.attribute_options ?? {}).filter(
      ([name, values]) => !skip.has(name) && Array.isArray(values) && values.length > 0,
    ),
  );
}

/**
 * Price a design and render its mockup. Returns the design with our price
 * and the stored mockup filled in. Throws StudioError with a sentence a
 * brand admin or franchisee can read when the engine cannot price it.
 */
export async function quoteDesign(
  sign: DesignableSign,
  input: SignDesign,
  link: { lineItemId?: string | null } = {},
): Promise<SignDesign> {
  if (sign.pricing_basis !== 'direct' || !sign.pricing_type) {
    throw new StudioError('This sign type is priced by hand, so the Studio cannot price it. It stays a custom quote.');
  }
  const logo = await getUpload(input.logo.path);
  if (!logo) throw new StudioError('Upload the logo again — the stored copy could not be read.');

  let quote;
  try {
    quote = await priceDesign(
      {
        pricingType: sign.pricing_type,
        options: input.options,
        dimension: input.dimension,
        depthInches: input.depthInches,
        logo: { bytes: logo.body, contentType: logo.contentType, fileName: input.logo.fileName },
      },
      offeredOptions(sign),
    );
  } catch (error) {
    if (error instanceof EngineUnavailableError) {
      console.error('design engine unavailable', error.message);
      throw new StudioError('The Design Studio is unavailable right now. Try again in a few minutes.');
    }
    if (error instanceof EngineRejectedError) throw new StudioError(`The Studio could not price this design: ${error.message}`);
    throw error;
  }

  const margin = resolveMargin(await listMarginRows(), sign.brand_id, sign.sign_type);
  const price = priceFromCost(quote.cost, margin.percent);
  if (price === null) throw new StudioError('The Studio returned no usable price.');

  const mockupPath = quote.mockup
    ? (
        await putUpload(
          new File([new Uint8Array(quote.mockup.bytes)], 'mockup.jpg', { type: quote.mockup.contentType }),
          `${sign.brand_slug}/mockups`,
        )
      ).storagePath
    : null;

  await query(
    `insert into engine_quotes (brand_id, brand_item_id, line_item_id, sign_type, cost, margin_percent,
                                price, turnaround_days, quotation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      sign.brand_id,
      sign.id,
      link.lineItemId ?? null,
      sign.sign_type,
      quote.cost,
      margin.percent,
      price,
      quote.turnaroundDays,
      quote.quotationId,
    ],
  );

  return {
    logo: input.logo,
    options: input.options,
    dimension: input.dimension,
    depthInches: input.depthInches,
    mockupPath,
    price,
    turnaroundDays: quote.turnaroundDays,
    widthInches: quote.widthInches,
    heightInches: quote.heightInches,
    pricedAt: new Date().toISOString(),
  };
}

/**
 * A brand admin saves a sign's design and its rules. The design is priced
 * here, on the server, whatever the page showed; the price becomes the sign's
 * est_price (engine-sourced), and the options become its locked choices.
 */
export async function saveBrandDesign(
  sign: DesignableSign,
  actor: CatalogActor,
  input: SignDesign,
  rawRules: unknown,
): Promise<SignDesign> {
  const priced = await quoteDesign(sign, input);
  const rules = rawRules === undefined ? defaultRules(priced) : validRules(rawRules, priced);
  await transaction(async (exec) => {
    await exec.query(
      `update brand_items
          set design = $2, design_rules = $3, est_price = $4, price_source = 'engine',
              pinned_attributes = $5, spec_summary = $6
        where id = $1`,
      [sign.id, JSON.stringify(priced), JSON.stringify(rules), priced.price, JSON.stringify(priced.options), designSummary(priced)],
    );
    await exec.query(
      `insert into catalog_events (brand_id, brand_item_id, kind, actor_membership_id, actor_label, summary, detail)
       values ($1, $2, 'sign_designed', $3, $4, $5, $6)`,
      [
        sign.brand_id,
        sign.id,
        actor.membershipId,
        actor.label,
        `${actor.label} designed ${sign.name} in the Studio — $${priced.price?.toLocaleString('en-US')}`,
        JSON.stringify({ price: priced.price, dimension: priced.dimension, rules }),
      ],
    );
  });
  return priced;
}

/** A brand admin's logo for the Studio: PNG, JPG or WEBP, small enough for the engine. */
export async function storeLogo(formData: FormData, brandSlug: string): Promise<SignDesign['logo']> {
  const file = formData.get('file');
  if (!(file instanceof File)) throw new StudioError('No logo received.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new StudioError('Upload the logo as a PNG, JPG or WEBP.');
  }
  if (file.size > 2 * 1024 * 1024) throw new StudioError('Logos are limited to 2 MB.');
  const stored = await putUpload(file, `${brandSlug}/logos`);
  return { path: stored.storagePath, fileName: stored.fileName, contentType: stored.contentType };
}
