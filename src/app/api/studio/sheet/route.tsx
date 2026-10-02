// A PREVIEW quote sheet for the design on screen (DECISIONS #168): a
// franchisee in the Studio panel before submitting, or a brand admin in the
// Studio. Not stored — the stored sheet is made at submission. The design is
// priced here on the server (normally from the cache the preview just filled),
// never taken from the browser.

import { checkCorporate } from '@/lib/auth/corporate';
import { checkStoreCreation, checkStoreOrdering } from '@/lib/auth/stores';
import { getBrandBySlug } from '@/lib/db/queries';
import type { SignDesign } from '@/lib/designs/design';
import { fileSlug, renderSignSheet } from '@/lib/designs/sheets';
import { StudioError, getDesignableSign, quoteDesign } from '@/lib/designs/studio';

interface SheetRequest {
  brandSlug: string;
  /** Who is asking: the brand's own admin, or a franchisee ordering. */
  as: 'brand' | 'franchisee';
  /** A franchisee's store; null while setting up a new one. */
  locationId?: string | null;
  brandItemId: string;
  design: SignDesign;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SheetRequest | null;
  if (!body?.brandSlug || !body.brandItemId || !body.design) return new Response('Bad request', { status: 400 });

  const access =
    body.as === 'brand'
      ? await checkCorporate(body.brandSlug, { manage: true })
      : body.locationId
        ? await checkStoreOrdering(body.brandSlug, body.locationId)
        : await checkStoreCreation(body.brandSlug);
  if ('error' in access) return new Response(access.error, { status: 403 });

  const brand = await getBrandBySlug(body.brandSlug);
  if (!brand) return new Response('Not found', { status: 404 });
  const sign = await getDesignableSign(body.brandItemId, brand.id);
  if (!sign) return new Response('Not found', { status: 404 });

  try {
    const priced = await quoteDesign(sign, body.design);
    const pdf = await renderSignSheet({
      brand,
      signName: sign.name,
      signType: sign.sign_type,
      design: priced,
      reference: 'Design preview',
      preparedFor: null,
      preview: true,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${fileSlug(sign.name)}-quote-sheet-preview.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof StudioError) return new Response(error.message, { status: 422 });
    throw error;
  }
}
