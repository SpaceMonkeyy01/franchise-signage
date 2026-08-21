// The formal invoice and the paid receipt (SPEC §8b, documents 2 and 3).
//
// The last two moments of the §8b sequence. The budgetary quote answered
// underwriting; these answer disbursement. An SBA-style loan pays in controlled
// disbursements against vendor paperwork, so the invoice is what releases the
// money and the receipt is what proves it landed — which is why they are one
// file: a receipt is an invoice that has been paid, and building them apart
// invites them to disagree about the amount.
//
// Both cover ONE package, not the whole request, and that is the difference
// from the budgetary quote. An estimate covers a site because a lender funds a
// site; an invoice covers what Signage.com is owed. On a request split across
// two recipients (SPEC §4) the vendor's package is invoiced by the vendor, and
// the schema refuses an invoice number on an external quote for that reason.
//
// Neither document processes a payment. SPEC §11 keeps that out of MVP and
// nothing here changes it: the team records what the bank statement already
// says, and these render it.

import { Text, View } from '@react-pdf/renderer';

import type { LineItemRow, QuoteRow, RequestDetail } from '../db/queries';
import { toDocumentLine } from './budgetary-quote';
import {
  DocumentShell,
  LineTable,
  PAYEE,
  documentDate,
  pdfMoney,
  styles,
  type DocumentLine,
  type PdfBrand,
} from './letterhead';

/** The items in one package, in the request's own order. */
export function packageLines(items: LineItemRow[], quote: QuoteRow): DocumentLine[] {
  const inPackage = new Set(quote.line_item_ids);
  return items.filter((item) => inPackage.has(item.id)).map(toDocumentLine);
}

export interface InvoiceTotals {
  /** What is billed now: priced lines only. */
  due: number;
  /** Lines still unpriced. On an invoice this should always be zero. */
  unpriced: number;
}

export function invoiceTotals(lines: DocumentLine[]): InvoiceTotals {
  return lines.reduce<InvoiceTotals>(
    (acc, line) =>
      line.unitPrice === null
        ? { ...acc, unpriced: acc.unpriced + 1 }
        : { ...acc, due: acc.due + line.unitPrice * line.quantity },
    { due: 0, unpriced: 0 },
  );
}

export interface InvoiceProps {
  brand: PdfBrand & { name: string };
  request: RequestDetail;
  quote: QuoteRow;
  /** Set → the paid receipt. Null → the formal invoice. */
  paid?: { at: Date; method: string; reference: string | null } | null;
}

/**
 * One component for both documents.
 *
 * They differ in four places — the type, the purpose, the total's label, and
 * whether a PAID block appears — and in nothing else. Rendering them from one
 * body is what guarantees the receipt says the same number as the invoice it
 * acknowledges, which is the only thing a lender cross-checks between them.
 */
export function Invoice({ brand, request, quote, paid = null }: InvoiceProps) {
  const lines = packageLines(request.items, quote);
  const totals = invoiceTotals(lines);
  const isReceipt = paid !== null;

  const address = request.location.address ?? {};
  const site = [address.line1, address.city, address.state, address.zip]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(', ');

  return (
    <DocumentShell
      brand={brand}
      documentType={isReceipt ? 'Receipt' : 'Invoice'}
      reference={quote.invoice_number ?? request.code}
      issuedAt={isReceipt ? paid.at : (quote.invoiced_at ? new Date(quote.invoiced_at) : new Date())}
      purpose={
        isReceipt
          ? `Payment received in full for signage supplied by Signage.com for ${request.location.name}${site ? `, ${site}` : ''}, under invoice ${quote.invoice_number ?? request.code}.`
          : `Signage fabrication and installation by Signage.com for ${request.location.name}${site ? `, ${site}` : ''}, against accepted quote ${request.code}.`
      }
      billedTo={`${request.location.name}${site ? ` — ${site}` : ''}`}
      disclaimer={
        isReceipt
          ? 'This receipt acknowledges payment received in full against the invoice named above. Retain for your records and for your lender’s disbursement file.'
          : 'Payable to Signage.com. This invoice covers only the items listed above; signage supplied by any other vendor is invoiced by that vendor directly. Excludes permits and permit-required engineering unless itemised.'
      }
    >
      {/* The receipt leads with PAID. An underwriter clearing a disbursement is
          looking for one fact, and it should not be below the line items. */}
      {isReceipt && (
        <View
          style={{
            borderWidth: 1.5,
            borderColor: '#166534',
            padding: 10,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#166534' }}>
            PAID IN FULL
          </Text>
          <Text style={{ fontSize: 9, marginTop: 3 }}>
            {pdfMoney(totals.due)} received {documentDate(paid.at)} by {paid.method}
            {paid.reference ? ` · ${paid.reference}` : ''}
          </Text>
        </View>
      )}

      <LineTable lines={lines} priceHeader="Amount" />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{isReceipt ? 'Total paid' : 'Total due'}</Text>
        <Text style={styles.totalValue}>{pdfMoney(totals.due)}</Text>
      </View>

      {/* Should not happen: the team prices every standin item before a quote is
          delivered, and an invoice follows acceptance. If one slips through,
          saying so is better than billing a total that silently omits it. */}
      {totals.unpriced > 0 && (
        <Text style={styles.note}>
          {totals.unpriced} {totals.unpriced === 1 ? 'item is' : 'items are'} not priced on this
          invoice and {totals.unpriced === 1 ? 'is' : 'are'} billed separately. Contact{' '}
          {PAYEE.email} before paying.
        </Text>
      )}

      {!isReceipt && (
        <View style={{ marginTop: 20 }}>
          <Text style={styles.sectionTitle}>REMIT TO</Text>
          <Text style={{ fontSize: 10 }}>{PAYEE.name}</Text>
          {/* PAYEE.address is deliberately null until the real trading address
              is confirmed. An invented remittance address on an invoice is how
              a disbursement goes to nobody. */}
          <Text style={{ fontSize: 9, color: '#374151', marginTop: 2 }}>{PAYEE.email}</Text>
          <Text style={{ fontSize: 9, color: '#374151', marginTop: 6 }}>
            Please quote invoice {quote.invoice_number ?? request.code} with payment. If a lender is
            disbursing against this invoice, this is the document they need.
          </Text>
        </View>
      )}
    </DocumentShell>
  );
}
