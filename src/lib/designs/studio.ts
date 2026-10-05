// The Design Studio's server side (SPEC v2.6 §8, DECISIONS #166): price a
// design through the Signize engine, apply Signage.com's margin, keep the
// mockup in our storage, and save a brand sign's design and rules.
//
// SERVER ONLY. Signize's cost goes into engine_quotes (team only) and nowhere
// else; what returns to a page is our price.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CatalogActor } from '../catalog/manage';
import { query, queryOne, transaction } from '../db/pool';
import { priceFromCost, resolveMargin } from '../pricing/margin';
import { listMarginRows } from '../pricing/margins';
import {
  EngineRejectedError,
  EngineUnavailableError,
  priceDesign,
  renderMockup,
  type AllowedOptions,
} from '../signize/client';
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
  placement: 'indoor' | 'outdoor';
  /** The mockup engine's style for this type (master_catalog.render_key). */
  render_key: string | null;
  fabricated_finish: string | null;
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
            mc.sign_type, mc.placement, mc.render_key, mc.fabricated_finish,
            mc.pricing_type, mc.pricing_basis, mc.attribute_options,
            bi.design, bi.design_rules, bi.pinned_attributes, bi.est_price
       from brand_items bi
       join brands b on b.id = bi.brand_id
       join master_catalog mc on mc.id = bi.master_catalog_id
      where bi.id = $1 and bi.brand_id = $2`,
    [itemId, brandId],
  );
}

/** Whether the engine prices this sign; a custom-quote type is priced by the team. */
export function studioPrices(sign: Pick<DesignableSign, 'pricing_basis' | 'pricing_type'>): boolean {
  return sign.pricing_basis === 'direct' && !!sign.pricing_type;
}

/**
 * Whether the Studio can design this sign at all: one it prices, or a
 * custom-quote type it can at least draw (a mockup style is known).
 */
export function studioDesigns(sign: Pick<DesignableSign, 'pricing_basis' | 'pricing_type' | 'render_key'>): boolean {
  return studioPrices(sign) || !!sign.render_key;
}

/**
 * The options a sign type offers, without the engine's bookkeeping fields.
 * None for a custom-quote type: its options are a stand-in pricing model's
 * (channel letters' raceways on a pylon), not choices about the sign.
 */
export function offeredOptions(sign: Pick<DesignableSign, 'attribute_options' | 'pricing_basis'>): AllowedOptions {
  if (sign.pricing_basis === 'standin') return {};
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
  if (!studioDesigns(sign)) {
    throw new StudioError('The Studio has no drawing style for this sign type yet. It stays a custom quote.');
  }
  const logo = await getUpload(input.logo.path);
  if (!logo) throw new StudioError('Upload the logo again — the stored copy could not be read.');

  const logoFile = { bytes: logo.body, contentType: logo.contentType, fileName: input.logo.fileName };
  if (!studioPrices(sign)) return drawDesign(sign, input, logoFile);
  // Price and picture together: the pricing call's own picture is a generic
  // "letters on a wall", so the sign is drawn in its own style by the mockup
  // engine, side by side with the pricing call (no extra wait). A failed
  // drawing falls back to the pricing call's picture rather than to none.
  const styled = sign.render_key
    ? renderMockup({
        style: sign.render_key,
        logo: logoFile,
        scene: await sceneFor(sign.placement),
        fabricatedFinish: sign.fabricated_finish,
        trimless: /trimless/i.test(input.options.trim_type ?? ''),
      }).catch((error) => {
        console.error('styled mockup failed', error instanceof Error ? error.message : error);
        return null;
      })
    : Promise.resolve(null);

  let quote;
  try {
    quote = await priceDesign(
      {
        pricingType: sign.pricing_type!,
        options: input.options,
        dimension: input.dimension,
        depthInches: input.depthInches,
        logo: logoFile,
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

  const picture = (await styled) ?? quote.mockup;
  const mockupPath = picture
    ? (
        await putUpload(
          new File([new Uint8Array(picture.bytes)], 'mockup.jpg', { type: picture.contentType }),
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
    sideViewPath: await storeSideView(quote.sideViewUrl, sign.brand_slug),
    materials: quote.materials,
    mounting: quote.mounting,
  };
}

/**
 * A custom-quote sign (SPEC §2.1): the Studio draws it in its own style so
 * franchisees, corporate and the team see the sign, but nothing prices it —
 * the team quotes it per order, as before. Size is kept for the spec and the
 * team's quote; there are no options to choose.
 */
async function drawDesign(
  sign: DesignableSign,
  input: SignDesign,
  logo: { bytes: Buffer; contentType: string; fileName: string },
): Promise<SignDesign> {
  let picture;
  try {
    picture = await renderMockup({
      style: sign.render_key!,
      logo,
      scene: await sceneFor(sign.placement),
      fabricatedFinish: sign.fabricated_finish,
      trimless: false,
    });
  } catch (error) {
    if (error instanceof EngineUnavailableError || error instanceof EngineRejectedError) {
      console.error('design engine unavailable', error.message);
      throw new StudioError('The Design Studio is unavailable right now. Try again in a few minutes.');
    }
    throw error;
  }
  const stored = await putUpload(
    new File([new Uint8Array(picture.bytes)], 'mockup.jpg', { type: picture.contentType }),
    `${sign.brand_slug}/mockups`,
  );
  return {
    logo: input.logo,
    options: {},
    dimension: input.dimension,
    depthInches: input.depthInches,
    mockupPath: stored.storagePath,
    price: null,
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
  if (priced.price == null) return saveDrawnDesign(sign, actor, priced, rules);
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

/**
 * A custom-quote sign's design: the picture and the size, and nothing about
 * price — est_price stays empty, price_source stays the team's, and the spec
 * line and locked choices the brand set by hand are left as they are.
 */
async function saveDrawnDesign(
  sign: DesignableSign,
  actor: CatalogActor,
  drawn: SignDesign,
  rules: DesignRules,
): Promise<SignDesign> {
  await transaction(async (exec) => {
    await exec.query(`update brand_items set design = $2, design_rules = $3 where id = $1`, [
      sign.id,
      JSON.stringify(drawn),
      JSON.stringify(rules),
    ]);
    await exec.query(
      `insert into catalog_events (brand_id, brand_item_id, kind, actor_membership_id, actor_label, summary, detail)
       values ($1, $2, 'sign_designed', $3, $4, $5, $6)`,
      [
        sign.brand_id,
        sign.id,
        actor.membershipId,
        actor.label,
        `${actor.label} designed ${sign.name} in the Studio — custom quote`,
        JSON.stringify({ price: null, dimension: drawn.dimension, rules }),
      ],
    );
  });
  return drawn;
}

/**
 * The engine's side views are a handful of generic drawings (one per type and
 * mounting), so each is copied into our storage once per server and reused.
 * A failure leaves the sheet without one rather than failing the quote.
 */
const sideViews = new Map<string, string>();
async function storeSideView(url: string | null, brandSlug: string): Promise<string | null> {
  if (!url) return null;
  const known = sideViews.get(url);
  if (known) return known;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const stored = await putUpload(new File([bytes], 'side-view', { type }), `${brandSlug}/side-views`);
    sideViews.set(url, stored.storagePath);
    return stored.storagePath;
  } catch {
    return null;
  }
}

/**
 * The default background a sign is drawn onto, by where it goes: Signize's
 * own two scenes (src/lib/signize/scenes). A franchisee's storefront photo can
 * replace it later.
 */
const scenes = new Map<string, { bytes: Buffer; contentType: string; fileName: string }>();
async function sceneFor(placement: 'indoor' | 'outdoor') {
  const known = scenes.get(placement);
  if (known) return known;
  const fileName = placement === 'indoor' ? 'indoor.png' : 'outdoor.jpg';
  const scene = {
    bytes: await readFile(join(process.cwd(), 'src', 'lib', 'signize', 'scenes', fileName)),
    contentType: placement === 'indoor' ? 'image/png' : 'image/jpeg',
    fileName,
  };
  scenes.set(placement, scene);
  return scene;
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
