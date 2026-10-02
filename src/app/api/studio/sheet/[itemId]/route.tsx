// A brand's own quote sheet for a sign it designed (DECISIONS #168): the
// saved design, its price and mockup — useful in franchise sales packs. Any
// corporate account of the brand may download it; nothing calls the engine.

import { checkCorporate } from '@/lib/auth/corporate';
import { fileSlug, renderSignSheet } from '@/lib/designs/sheets';
import { getDesignableSign } from '@/lib/designs/studio';

export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const brandSlug = new URL(request.url).searchParams.get('brand') ?? '';
  const access = await checkCorporate(brandSlug);
  if ('error' in access) return new Response(access.error, { status: 403 });

  const sign = await getDesignableSign(itemId, access.brand.id);
  if (!sign?.design) return new Response('This sign has no Studio design yet.', { status: 404 });

  const pdf = await renderSignSheet({
    brand: access.brand,
    signName: sign.name,
    signType: sign.sign_type,
    design: sign.design,
    reference: `${access.brand.name} standard design`,
    preparedFor: null,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${fileSlug(sign.name)}-quote-sheet.pdf"`,
    },
  });
}
