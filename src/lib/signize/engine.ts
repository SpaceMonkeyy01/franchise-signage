// The Signize pricing engine's request and response, as pure functions
// (SPEC v2.6 §8, docs/signize-integration.md). No network and no secrets
// here — `client.ts` does the call — so the translation is testable.
//
// Today's route is the session endpoint the Signize Studio itself uses,
// POST /api/sign-pricing, because it takes every option a sign has. The keyed
// v1 API (sz_live_ keys) takes fewer; when Signize issues us a key the client
// switches, and this file gains a v1 form builder beside this one.

import { createHash } from 'node:crypto';

/** One option list from master_catalog.attribute_options (the engine's own data). */
export type AllowedOptions = Record<string, readonly { value: string }[]>;

export interface EngineFile {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}

export interface EngineDesign {
  /** master_catalog.pricing_type — the engine's sign_type name. */
  pricingType: string;
  /** Chosen options, by the engine's field names (mounting_type, paint_finish, …). */
  options: Record<string, string>;
  /** The one dimension the customer gives; the engine derives the other from the logo. */
  dimension: { axis: 'height' | 'width'; inches: number };
  depthInches?: number | null;
  logo: EngineFile;
}

export interface EngineQuote {
  /** Signize's cost in USD, shipping included. Team-only: never sent to a page. */
  cost: number;
  turnaroundDays: number | null;
  widthInches: number | null;
  heightInches: number | null;
  depthInches: number | null;
  mounting: string | null;
  materials: string[];
  quotationId: string | null;
  /** The engine's side-view drawing for the type and mounting (a public image on its host). */
  sideViewUrl: string | null;
  /** The rendered mockup, when the engine made one. */
  mockup: { bytes: Buffer; contentType: string } | null;
}

export class EngineRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineRejectedError';
  }
}

/** Fields the engine reads that are not options of the sign. */
const NOT_OPTIONS = new Set(['basic_fields', 'avg_char_height', 'depth_range', 'ul_required', 'char_height_band']);

/**
 * The multipart fields for POST /api/sign-pricing. Every option the sign
 * type offers is sent: a chosen value if there is one and it is allowed,
 * otherwise the first allowed value — which is what the Signize Studio does
 * for a field the customer has not touched.
 */
export function pricingFields(design: EngineDesign, allowed: AllowedOptions): [string, string][] {
  const { axis, inches } = design.dimension;
  if (!Number.isFinite(inches) || inches <= 0) throw new EngineRejectedError('A sign needs a size.');
  const fields: [string, string][] = [
    ['sign_type', design.pricingType],
    ['sign_width_or_height', String(inches)],
    ['user_input_dimension', axis],
    ['sign_height', axis === 'height' ? String(inches) : '0'],
    ['sign_width', axis === 'width' ? String(inches) : '0'],
    ['size', ''],
    ['mockupCreationType', 'false'],
    ['destination_country', 'US'],
    ['destination_country_name', 'United States'],
  ];
  if (design.depthInches) fields.push(['sign_depth', String(design.depthInches)]);
  for (const [name, choices] of Object.entries(allowed)) {
    if (NOT_OPTIONS.has(name) || !Array.isArray(choices) || choices.length === 0) continue;
    const chosen = design.options[name];
    const valid = chosen !== undefined && choices.some((choice) => choice.value === chosen);
    fields.push([name, valid ? chosen : choices[0].value]);
  }
  return fields;
}

/** Read the engine's answer. Throws EngineRejectedError when it priced nothing. */
export function readPricing(body: unknown): EngineQuote {
  const root = (body ?? {}) as Record<string, unknown>;
  const calculation = (root.calculation ?? {}) as Record<string, unknown>;
  const data = (calculation.data ?? root.data ?? {}) as Record<string, unknown>;
  const cost = Number(data.totalCost);
  if (root.success === false || calculation.success === false || !Number.isFinite(cost) || cost <= 0) {
    const reason = [root.message, root.error, calculation.message].find((m) => typeof m === 'string' && m);
    throw new EngineRejectedError(typeof reason === 'string' ? reason : 'The pricing engine returned no price.');
  }
  const number = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const image = typeof root.outputImageData === 'string' && root.outputImageData.length > 100 ? root.outputImageData : null;
  return {
    cost,
    turnaroundDays: number(data.tATDays),
    widthInches: number(data.signWidth),
    heightInches: number(data.signHeight),
    depthInches: number(data.signDepth),
    mounting: typeof data.mountingType === 'string' ? data.mountingType : null,
    materials: Array.isArray(data.materialsList) ? data.materialsList.filter((m): m is string => typeof m === 'string') : [],
    quotationId: data.quotationId === undefined || data.quotationId === null ? null : String(data.quotationId),
    sideViewUrl:
      typeof data.sideViewImage === 'string' && data.sideViewImage.startsWith('https://') ? data.sideViewImage : null,
    mockup: image
      ? {
          bytes: Buffer.from(image, 'base64'),
          contentType: typeof root.outputMimeType === 'string' ? root.outputMimeType : 'image/jpeg',
        }
      : null,
  };
}

/** Identifies a design for caching: the same fields and the same logo are the same quote. */
export function designKey(fields: readonly [string, string][], logo: EngineFile): string {
  const hash = createHash('sha256');
  for (const [name, value] of [...fields].sort(([a], [b]) => a.localeCompare(b))) hash.update(`${name}=${value}\n`);
  hash.update(logo.bytes);
  return hash.digest('hex');
}

// ------------------------------------------------------------------ mockups
//
// The pricing call returns a picture too, but it is the same generic "letters
// on a wall" whatever the sign type (2 Oct 2026: an A-frame and a lightbox
// both came back as halo-lit letters). The mockup engine draws the real thing
// — an A-frame, a lightbox, a pylon — from a style key, master_catalog's
// render_key. An unknown key is not an error there; it quietly draws letters,
// so a sign with no render_key gets no styled mockup at all.

export interface MockupDesign {
  /** master_catalog.render_key, e.g. "a-frame-sign". */
  style: string;
  logo: EngineFile;
  /** The background the sign is drawn onto. */
  scene: EngineFile;
  /** Engine finish token for fabricated letters (master_catalog.fabricated_finish). */
  fabricatedFinish?: string | null;
  /** Face-lit letters: trimless or with trim, from the design's options. */
  trimless?: boolean;
}

/** The form fields for POST /api/generate-mockup, as the Signize Studio sends them. */
export function mockupFields(design: MockupDesign): [string, string][] {
  const fields: [string, string][] = [
    ['signType', design.style],
    ['mountingType', 'flush'],
    ['xPercent', '50'],
    ['yPercent', '50'],
    ['signSize', '100'],
    ['isLightingOn', 'true'],
  ];
  if (design.style === 'face-lit-channel') {
    fields.push(['faceLitTrimStyle', design.trimless ? 'trimless' : 'trim'], ['faceLitReturnColor', 'logo-match']);
  }
  if (design.fabricatedFinish) fields.push(['fabricatedFinish', design.fabricatedFinish]);
  return fields;
}
