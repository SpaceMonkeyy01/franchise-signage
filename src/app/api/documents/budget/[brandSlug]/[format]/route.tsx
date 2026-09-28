// The budget one-pager download (SPEC §8b).
//
// Two callers, one document. SPEC §8b offers "a public brand-page download if
// trivial", and the sheet holds nothing about any franchisee — but it does hold
// a brand's whole standard-package price list, and publishing a franchisor's
// pricing is their call to make, not ours to assume (DECISIONS #44). So it
// stays behind sign-in: Signage.com, for exporting on a brand's behalf, and
// anyone with a role on THIS brand — corporate, §8b's actual actor, and its
// franchisees (#127). The corporate dashboard link that also counted until
// phase C is retired (SPEC v2.3 §10.3.4).

import { getBrandBySlug, getPackageForFormat } from '@/lib/db/queries';
import { getViewer, owesSecondFactor, storeScope } from '@/lib/auth/access';
import { getTeamMember } from '@/lib/auth/team';
import { queryOne } from '@/lib/db/pool';
import { BudgetOnePager } from '@/lib/pdf/budget-one-pager';
import { renderPdf } from '@/lib/pdf/letterhead';
import type { LocationFormat } from '@/lib/status/types';

const FORMATS: LocationFormat[] = ['inline', 'endcap', 'freestanding'];

function isFormat(value: string): value is LocationFormat {
  return (FORMATS as string[]).includes(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string; format: string }> },
) {
  const { brandSlug, format } = await params;
  if (!isFormat(format)) return new Response('Unknown location format', { status: 400 });

  if (!(await mayExport(brandSlug))) return new Response('Not found', { status: 404 });

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

/** Signage.com for any brand; otherwise a role on this one. */
async function mayExport(brandSlug: string): Promise<boolean> {
  if (await getTeamMember()) return true;

  // SPEC v2.3: anyone signed in with a role on this brand — brand admins and
  // reviewers, and franchisees, who could already download it from their §8d
  // welcome page.
  const viewer = await getViewer();
  if (!viewer || owesSecondFactor(viewer)) return false;
  const brand = await queryOne<{ id: string }>(`select id from brands where slug = $1`, [brandSlug]);
  return Boolean(brand && (await storeScope(viewer, brand.id)).kind !== 'none');
}
