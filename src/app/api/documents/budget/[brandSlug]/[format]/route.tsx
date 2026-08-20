// The budget one-pager download (SPEC §8b).
//
// Gated on the team allowlist rather than opened up. SPEC §8b offers "a public
// brand-page download if trivial", and the sheet holds nothing about any
// franchisee — but it does hold a brand's whole standard-package price list,
// and publishing a franchisor's pricing is their call to make, not ours to
// assume. The spec's actual trigger is corporate, whose dashboard is Session 6;
// until it exists the team exports on their behalf, and opening this route up
// is a one-line change once a brand says yes.

import { getBrandBySlug, getPackageForFormat } from '@/lib/db/queries';
import { getTeamMember } from '@/lib/auth/team';
import { BudgetOnePager } from '@/lib/pdf/budget-one-pager';
import { renderPdf } from '@/lib/pdf/letterhead';
import type { LocationFormat } from '@/lib/status/types';

const FORMATS: LocationFormat[] = ['inline', 'endcap', 'freestanding'];

function isFormat(value: string): value is LocationFormat {
  return (FORMATS as string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brandSlug: string; format: string }> },
) {
  const member = await getTeamMember();
  if (!member) return new Response('Not found', { status: 404 });

  const { brandSlug, format } = await params;
  if (!isFormat(format)) return new Response('Unknown location format', { status: 400 });

  const brand = await getBrandBySlug(brandSlug);
  if (!brand) return new Response('Not found', { status: 404 });

  const pkg = await getPackageForFormat(brand.id, format);
  // A brand with no package for a format has no number to give, and inventing
  // an empty sheet with a $0 total would be worse than refusing.
  if (!pkg || pkg.items.length === 0) {
    return new Response(`${brand.name} has no standard package for ${format} locations.`, {
      status: 404,
    });
  }

  const pdf = await renderPdf(
    <BudgetOnePager brand={brand} pkg={pkg} issuedAt={new Date()} />,
  );

  const filename = `${brandSlug}-signage-budget-${format}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      // Never cached: the sheet is priced from brand_items at request time, and
      // a stale price on a lender document is the one failure that matters.
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
