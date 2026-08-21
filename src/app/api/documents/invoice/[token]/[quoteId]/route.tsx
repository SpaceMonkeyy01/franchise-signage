// The formal invoice and the paid receipt (SPEC §8b), one route for both.
//
// `?kind=receipt` selects the receipt. They share a route because they share a
// document, a package and an amount — the receipt is the invoice once it has
// been paid — and splitting them would mean two places to keep the eligibility
// rules in step.
//
// Token-gated like the budgetary quote, not team-gated like the one-pager.
// SPEC §8b says both are team-TRIGGERED, and they are: nothing exists here
// until the team issues the invoice and records the payment. But the person who
// hands an invoice to a lender is the franchisee, and making them ask the team
// to email a PDF that already exists is the friction §8b was written to remove.
// Issuing is the team's; downloading what was issued is theirs.

import { getRequestByToken } from '@/lib/db/queries';
import { Invoice } from '@/lib/pdf/invoice';
import { renderPdf } from '@/lib/pdf/letterhead';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; quoteId: string }> },
) {
  const { token, quoteId } = await params;
  const detail = await getRequestByToken(token);
  if (!detail) return new Response('Not found', { status: 404 });

  // Scoped to the request the token opens: a quote id from another request must
  // not resolve here (SPEC §10).
  const quote = detail.quotes.find((row) => row.id === quoteId);
  if (!quote) return new Response('Not found', { status: 404 });

  if (!quote.invoice_number) {
    return new Response('No invoice has been issued for this package yet.', { status: 404 });
  }

  const wantsReceipt = new URL(request.url).searchParams.get('kind') === 'receipt';
  if (wantsReceipt && !quote.paid_at) {
    return new Response('No payment has been recorded against this invoice yet.', { status: 404 });
  }

  const pdf = await renderPdf(
    <Invoice
      brand={detail.brand}
      request={detail}
      quote={quote}
      paid={
        wantsReceipt
          ? {
              at: new Date(quote.paid_at!),
              method: quote.payment_method!,
              reference: quote.payment_reference,
            }
          : null
      }
    />,
  );

  const filename = `${quote.invoice_number.toLowerCase()}${wantsReceipt ? '-receipt' : ''}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      // Not cached, for the same reason as the other two: these are rendered
      // from live rows, and a stale amount on a lender document is the failure
      // that matters.
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
