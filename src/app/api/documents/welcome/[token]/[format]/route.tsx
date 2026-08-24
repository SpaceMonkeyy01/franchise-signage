// The budget one-pager, downloaded by the franchisee (SPEC §8b + §8d).
//
// The same document as `/api/documents/budget/{brandSlug}/{format}`, reached the
// other way round. That route is team-gated because the sheet is a brand's whole
// standard-package price list and publishing it openly is the franchisor's call
// (DECISIONS #44). This one is not open either: it needs a registration token,
// which means corporate decided to hand it to this person when they registered
// them at signing. Same document, same refusal to publish, and the authorization
// is the act of registration rather than a second gate.
//
// The format comes from the URL because at agreement signing the franchisee has
// no site and therefore no format — the landing page shows every format the
// brand has a package for and lets them take the one that matches the deal they
// are negotiating.

import { getPackageForFormat, getRegistrationByToken } from '@/lib/db/queries';
import { BudgetOnePager } from '@/lib/pdf/budget-one-pager';
import { renderPdf } from '@/lib/pdf/letterhead';
import type { LocationFormat } from '@/lib/status/types';

const FORMATS: LocationFormat[] = ['inline', 'endcap', 'freestanding'];

function isFormat(value: string): value is LocationFormat {
  return (FORMATS as string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; format: string }> },
) {
  const { token, format } = await params;

  const found = await getRegistrationByToken(token);
  // 404 rather than 403, as everywhere a token is the credential: an unknown
  // token must not be able to tell the difference between "wrong" and "expired".
  if (!found) return new Response('Not found', { status: 404 });
  if (!isFormat(format)) return new Response('Unknown location format', { status: 400 });

  const pkg = await getPackageForFormat(found.brand.id, format);
  if (!pkg || pkg.items.length === 0) {
    return new Response(`${found.brand.name} has no standard package for ${format} locations.`, {
      status: 404,
    });
  }

  const pdf = await renderPdf(
    <BudgetOnePager brand={found.brand} pkg={pkg} issuedAt={new Date()} />,
  );

  const filename = `${found.brand.slug}-signage-budget-${format}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      // Never cached: priced from brand_items at request time, and a stale price
      // on a lender document is the one failure that matters.
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
