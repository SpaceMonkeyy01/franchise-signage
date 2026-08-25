// The budget one-pager download (SPEC §8b).
//
// Two callers, one document. SPEC §8b offers "a public brand-page download if
// trivial", and the sheet holds nothing about any franchisee — but it does hold
// a brand's whole standard-package price list, and publishing a franchisor's
// pricing is their call to make, not ours to assume (DECISIONS #44). So it
// stays behind a credential, and there are now two that count:
//
//   · the team allowlist, for exporting on a brand's behalf;
//   · a corporate dashboard token for THIS brand — §8b's actual actor, whose
//     dashboard arrived in Session 6.
//
// The token is checked against the brand in the URL, so one franchisor's link
// cannot fetch another's price list.

import { corporateSession } from '@/lib/corporate/session';
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
  request: Request,
  { params }: { params: Promise<{ brandSlug: string; format: string }> },
) {
  const { brandSlug, format } = await params;
  if (!isFormat(format)) return new Response('Unknown location format', { status: 400 });

  if (!(await mayExport(request, brandSlug))) return new Response('Not found', { status: 404 });

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

/**
 * Either credential will do, and neither is inferred from the other.
 *
 * A team member may export any brand's sheet — that is what the allowlist means
 * (see the RLS header: membership IS the scope). A corporate token may export
 * exactly one brand's, and `corporateSession` is what enforces the match.
 */
async function mayExport(request: Request, brandSlug: string): Promise<boolean> {
  if (await getTeamMember()) return true;

  const token = new URL(request.url).searchParams.get('token');
  if (!token) return false;

  const session = await corporateSession(brandSlug, token);
  return session.ok;
}
