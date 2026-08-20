// Shared chrome for the §8b document set, and the renderer.
//
// Four documents come out of this file's shell: the budget one-pager, the
// budgetary quote, the formal invoice and the paid receipt. They share a
// letterhead because they are read by the same audience for the same purpose —
// a lender deciding whether to disburse against them.
//
// SPEC §8b states the bar plainly: "lenders require payee/amount/date/purpose to
// be evident". That is not a styling note, it is the acceptance criterion, so
// `DocumentShell` takes each of those as a required prop rather than leaving any
// of them to a caller's discretion. A document that cannot say who is being
// paid, for what, and when, does not get to render.
//
// Signage.com is the payee on every one of them, which is why the letterhead
// leads with Signage.com and carries the brand second — the exact inverse of the
// email chrome (SPEC §8d makes the brand the voice for franchisee-facing mail).
// A lender is being asked to pay Signage.com, and a document that leads with the
// franchisor's logo invites the question of which company the money goes to.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

/** The trading entity every §8b document is issued by. */
export const PAYEE = {
  name: 'Signage.com',
  line1: 'Signage.com',
  // Placeholder until the real trading address is confirmed — see the note in
  // the caller. Deliberately one obvious string rather than an invented address:
  // a plausible-looking fake address on a lender document is worse than a gap.
  address: null as string | null,
  email: 'billing@signage.com',
};

export interface PdfBrand {
  name: string;
  brand_colors?: { primary?: string; primaryDark?: string; primaryLight?: string } | null;
}

export function pdfColors(brand: PdfBrand) {
  return {
    primary: brand.brand_colors?.primary ?? '#111827',
    dark: brand.brand_colors?.primaryDark ?? brand.brand_colors?.primary ?? '#111827',
  };
}

export const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  letterhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#111827',
    paddingBottom: 10,
    marginBottom: 18,
  },
  payee: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  payeeMeta: { fontSize: 8, color: '#6b7280', marginTop: 2 },
  docType: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta: { fontSize: 8, color: '#6b7280', textAlign: 'right', marginTop: 2 },

  purpose: {
    backgroundColor: '#f3f4f6',
    padding: 9,
    marginBottom: 16,
  },
  purposeLabel: {
    fontSize: 7,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  purposeText: { fontSize: 10 },

  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    color: '#6b7280',
    marginBottom: 6,
  },

  row: { flexDirection: 'row', alignItems: 'flex-start' },
  th: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    color: '#6b7280',
    paddingBottom: 4,
  },
  td: { fontSize: 9, paddingVertical: 5 },
  tdMuted: { fontSize: 8, color: '#6b7280' },
  lineRow: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },

  colName: { flex: 1, paddingRight: 10 },
  colQty: { width: 34, textAlign: 'right' },
  colPrice: { width: 78, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#111827',
  },
  totalLabel: { fontSize: 9, color: '#6b7280', marginRight: 12 },
  totalValue: { fontSize: 16, fontFamily: 'Helvetica-Bold' },

  note: { fontSize: 8, color: '#6b7280', marginTop: 8, lineHeight: 1.5 },

  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
    fontSize: 7,
    color: '#6b7280',
    lineHeight: 1.5,
  },
});

/** Long-form dates: a lender reads these, and 03/04 is ambiguous across borders. */
export function documentDate(at: Date): string {
  return at.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function pdfMoney(value: string | number | null): string {
  if (value === null) return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole dollars, for estimates where cents imply a precision that is not there. */
export function pdfMoneyRound(value: string | number | null): string {
  if (value === null) return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

export interface DocumentShellProps {
  brand: PdfBrand;
  /** BUDGETARY QUOTE / INVOICE / RECEIPT / SIGNAGE BUDGET — set per document. */
  documentType: string;
  /** The document's own identifier, e.g. a request code or a format name. */
  reference: string;
  /** SPEC §8b: the date must be evident. */
  issuedAt: Date;
  /** SPEC §8b: the purpose must be evident. One sentence, in plain words. */
  purpose: string;
  /** Who the document concerns — the location or the franchisee. */
  billedTo?: string | null;
  children: React.ReactNode;
  /** Small print above the page footer, per document. */
  disclaimer: string;
}

export function DocumentShell(props: DocumentShellProps) {
  const colors = pdfColors(props.brand);

  return (
    <Document
      title={`${props.documentType} — ${props.reference}`}
      author={PAYEE.name}
      subject={props.purpose}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.letterhead}>
          <View>
            <Text style={styles.payee}>{PAYEE.name}</Text>
            <Text style={styles.payeeMeta}>
              Signage program for {props.brand.name}
            </Text>
            <Text style={styles.payeeMeta}>{PAYEE.email}</Text>
          </View>
          <View>
            <Text style={{ ...styles.docType, color: colors.dark }}>
              {props.documentType.toUpperCase()}
            </Text>
            <Text style={styles.docMeta}>{props.reference}</Text>
            <Text style={styles.docMeta}>Issued {documentDate(props.issuedAt)}</Text>
          </View>
        </View>

        {props.billedTo && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>FOR</Text>
            <Text style={{ fontSize: 10 }}>{props.billedTo}</Text>
          </View>
        )}

        {/* Purpose is its own block rather than a line of body copy: an
            underwriter skims for what this pays for before reading anything. */}
        <View style={styles.purpose}>
          <Text style={styles.purposeLabel}>PURPOSE</Text>
          <Text style={styles.purposeText}>{props.purpose}</Text>
        </View>

        {props.children}

        <View style={styles.footer} fixed>
          <Text>{props.disclaimer}</Text>
          <Text>
            {PAYEE.name} · {PAYEE.email} · Issued for {props.brand.name} ·{' '}
            {documentDate(props.issuedAt)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** One line of a document's item table. */
export interface DocumentLine {
  name: string;
  detail?: string | null;
  quantity: number;
  /** Null renders as a custom-quote line rather than a price. */
  unitPrice: number | null;
}

export function LineTable({
  lines,
  priceHeader = 'Est. price',
  round = false,
}: {
  lines: DocumentLine[];
  priceHeader?: string;
  round?: boolean;
}) {
  const fmt = round ? pdfMoneyRound : pdfMoney;
  return (
    <View>
      <View style={{ ...styles.row, borderBottomWidth: 1, borderBottomColor: '#111827' }}>
        <Text style={{ ...styles.th, ...styles.colName }}>ITEM</Text>
        <Text style={{ ...styles.th, ...styles.colQty }}>QTY</Text>
        <Text style={{ ...styles.th, ...styles.colPrice }}>{priceHeader.toUpperCase()}</Text>
      </View>
      {lines.map((line, index) => (
        <View key={`${line.name}-${index}`} style={{ ...styles.row, ...styles.lineRow }}>
          <View style={styles.colName}>
            <Text style={styles.td}>{line.name}</Text>
            {line.detail && <Text style={{ ...styles.tdMuted, marginBottom: 4 }}>{line.detail}</Text>}
          </View>
          <Text style={{ ...styles.td, ...styles.colQty }}>{line.quantity}</Text>
          <Text style={{ ...styles.td, ...styles.colPrice }}>
            {line.unitPrice === null
              ? 'Custom quote'
              : fmt(line.unitPrice * line.quantity)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Render a document element to a PDF buffer. */
export async function renderPdf(element: React.ReactElement): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any);
}
