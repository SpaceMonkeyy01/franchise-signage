// The Signize pricing engine, called from our server only (SPEC v2.6 §8).
// The credential never reaches a page, and neither does Signize's cost: callers
// apply Signage.com's margin (src/lib/pricing) before anything is shown.
//
// SERVER ONLY — import from server actions, route handlers and server
// components, never from a 'use client' module.
//
// Credential: a signize.ai session (owner's login, 2FA verified), from the
// host's SIGNIZE_SESSION_TOKEN or else the token the team saved on
// /admin/pricing (./token.ts, DECISIONS #183). It expires; when it does the
// engine answers 401 and this throws EngineUnavailableError, and every screen
// falls back as §8 point 6 requires.

import {
  EngineRejectedError,
  designKey,
  mockupFields,
  pricingFields,
  readPricing,
  type AllowedOptions,
  type EngineDesign,
  type EngineQuote,
  type MockupDesign,
} from './engine';
import { engineToken } from './token';

export { EngineRejectedError };
export type { AllowedOptions, EngineDesign, EngineQuote };

const BASE_URL = process.env.SIGNIZE_API_URL ?? 'https://api.signize.ai/api';
/** The engine takes ~15 s to price and render; anything past this is treated as down. */
const TIMEOUT_MS = 60_000;
/** Mockups are ~0.5 MB each, so the cache stays small. */
const CACHE_LIMIT = 40;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

export async function engineConfigured(): Promise<boolean> {
  return Boolean(await engineToken());
}

const cache = new Map<string, { at: number; quote: EngineQuote }>();
const inFlight = new Map<string, Promise<EngineQuote>>();

/**
 * Price (and render) one design. Identical designs within a few hours are
 * answered from memory, and identical concurrent requests share one call —
 * every call is billed to Signage.com's Signize account.
 */
export async function priceDesign(design: EngineDesign, allowed: AllowedOptions): Promise<EngineQuote> {
  const token = await engineToken();
  if (!token) throw new EngineUnavailableError('The design engine is not connected.');

  const fields = pricingFields(design, allowed);
  const key = designKey(fields, design.logo);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.quote;
  const running = inFlight.get(key);
  if (running) return running;

  const call = (async () => {
    const form = new FormData();
    form.append(
      'sign_image',
      new Blob([new Uint8Array(design.logo.bytes)], { type: design.logo.contentType }),
      design.logo.fileName,
    );
    for (const [name, value] of fields) form.append(name, value);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/sign-pricing`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new EngineUnavailableError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'The design engine took too long to answer.'
          : 'The design engine could not be reached.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new EngineUnavailableError('The design engine refused our credentials; the Signize session needs renewing.');
    }
    if (response.status >= 500 || response.status === 429) {
      throw new EngineUnavailableError(`The design engine is unavailable (${response.status}).`);
    }
    const body = await response.json().catch(() => null);
    const quote = readPricing(body);

    cache.set(key, { at: Date.now(), quote });
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    return quote;
  })();

  inFlight.set(key, call);
  try {
    return await call;
  } finally {
    inFlight.delete(key);
  }
}

const mockups = new Map<string, { at: number; image: { bytes: Buffer; contentType: string } }>();

/**
 * Draw a sign in its own style onto a scene (POST /api/generate-mockup).
 * Cached like quotes: the same style, logo and scene draw the same picture,
 * and every call is billed.
 */
export async function renderMockup(design: MockupDesign): Promise<{ bytes: Buffer; contentType: string }> {
  const token = await engineToken();
  if (!token) throw new EngineUnavailableError('The design engine is not connected.');
  const fields = mockupFields(design);
  const key = designKey([...fields, ['scene', design.scene.fileName]], {
    ...design.logo,
    bytes: Buffer.concat([design.logo.bytes, design.scene.bytes.subarray(0, 4096)]),
  });
  const cached = mockups.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.image;

  const form = new FormData();
  form.append('LogoImage', new Blob([new Uint8Array(design.logo.bytes)], { type: design.logo.contentType }), design.logo.fileName);
  form.append('sceneImage', new Blob([new Uint8Array(design.scene.bytes)], { type: design.scene.contentType }), design.scene.fileName);
  for (const [name, value] of fields) form.append(name, value);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/generate-mockup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EngineUnavailableError('The mockup engine could not be reached.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new EngineUnavailableError('The design engine refused our credentials; the Signize session needs renewing.');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.startsWith('image/')) {
    throw new EngineUnavailableError(`The mockup engine returned no image (${response.status}).`);
  }
  const image = { bytes: Buffer.from(await response.arrayBuffer()), contentType: contentType.split(';')[0] };
  mockups.set(key, { at: Date.now(), image });
  while (mockups.size > CACHE_LIMIT) mockups.delete(mockups.keys().next().value!);
  return image;
}
