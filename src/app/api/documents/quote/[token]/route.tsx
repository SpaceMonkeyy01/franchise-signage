// The budgetary quote download (SPEC §8b).
//
// The token is the credential, exactly as it is on the status page this link
// sits on (SPEC §10) — `getRequestByToken` applies it in the WHERE clause, so an
// unknown token returns null rather than someone else's request. Nothing else
// gates it: §8b puts this document in the franchisee's hands "once a quote
// exists" precisely because they are the one filling in a loan application, and
// making them ask the team for it defeats the point.
//
// Note the inversion against the budget one-pager, which is team-gated: that
// sheet is a brand's whole price list and belongs to corporate, while this one
// is a single franchisee's own request, priced for them.

import { getRequestByToken } from '@/lib/db/queries';
import { BudgetaryQuote } from '@/lib/pdf/budgetary-quote';
import { renderPdf } from '@/lib/pdf/letterhead';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await getRequestByToken(token);
  if (!request) return new Response('Not found', { status: 404 });

  if (request.quotes.length === 0) {
    return new Response('This request has no quote yet.', { status: 404 });
  }

  // Same refusal as the one-pager: a routed-but-unpriced request would render a
  // lender document whose total is $0, which reads as a real number. Wait for a
  // price rather than publish a wrong one.
  const priced = request.quotes.some((quote) => quote.priced_count > 0);
  if (!priced) {
    return new Response('This request is quoted but not yet priced.', { status: 404 });
  }

  const pdf = await renderPdf(
    <BudgetaryQuote brand={request.brand} request={request} issuedAt={new Date()} />,
  );

  const filename = `${request.code.toLowerCase()}-budgetary-quote.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      // Never cached, for the same reason as the one-pager: manual pricing moves
      // these numbers, and a stale price on a lender document is the one failure
      // that matters.
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
