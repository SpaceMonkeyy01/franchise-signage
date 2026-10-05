// The sign quote sheet (DECISIONS #168): one page per Studio-designed sign —
// the mockup, the engine's side view, the size, every chosen option, the
// turnaround and Signage.com's estimated price.
//
// The Signize Studio makes a similar sheet in the browser; this one is ours,
// on the §8b letterhead, so it reads as Signage.com's document and never
// carries Signize's cost. Its price is the design's, which is the line's
// snapshot: the same number the franchisee saw and corporate reviews.
//
// Pure: images arrive as bytes, so the route and the submission step both
// render it the same way.

import { Image, Text, View } from '@react-pdf/renderer';

import { attributeLabel } from '../catalog/labels';
import type { SignDesign } from '../designs/design';
import { DocumentShell, pdfMoneyRound, styles, type PdfBrand } from './letterhead';

export interface SheetImage {
  data: Buffer;
  format: 'png' | 'jpg';
}

export interface SignQuoteSheetProps {
  brand: PdfBrand;
  /** The sign's name as the brand calls it. */
  signName: string;
  /** The catalog's sign type, e.g. "Illuminated Channel Letters". */
  signType: string;
  design: SignDesign;
  /** A request code + line, or "Design preview". */
  reference: string;
  /** The location or franchisee it concerns; null for a brand's own sheet. */
  preparedFor: string | null;
  issuedAt: Date;
  mockup: SheetImage | null;
  sideView: SheetImage | null;
  /** Previews are not records: they say so across the top. */
  preview?: boolean;
}

/** PNG and JPEG only — what the PDF renderer can draw. */
export function sheetImage(bytes: Buffer, contentType: string): SheetImage | null {
  if (contentType === 'image/png') return { data: bytes, format: 'png' };
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return { data: bytes, format: 'jpg' };
  return null;
}

function sizeLine(design: SignDesign): string {
  const given = `${design.dimension.inches}" ${design.dimension.axis}`;
  if (design.widthInches && design.heightInches) {
    return `${design.widthInches}" W × ${design.heightInches}" H`;
  }
  return given;
}

export function SignQuoteSheet(props: SignQuoteSheetProps) {
  const { design } = props;
  const specs: [string, string][] = [
    ['Sign', props.signName],
    ['Type', props.signType],
    ['Size', sizeLine(design)],
    ...(design.depthInches ? ([['Depth', `${design.depthInches}"`]] as [string, string][]) : []),
    ...Object.entries(design.options).map(([name, value]) => [attributeLabel(name), value] as [string, string]),
  ];

  return (
    <DocumentShell
      brand={props.brand}
      documentType="Sign quote sheet"
      reference={props.reference}
      issuedAt={props.issuedAt}
      billedTo={props.preparedFor}
      purpose={`Design and estimated price for one sign — ${props.signName} — as configured in the Signage.com Design Studio.`}
      disclaimer={
        'An estimate, not a quote: Signage.com confirms the final price in your quote. Prices include shipping within ' +
        'the United States. The image is a generated mockup; fabrication follows the approved specification. ' +
        'No landlord or permit approval is implied.'
      }
    >
      {props.preview && (
        <View style={{ backgroundColor: '#fef3c7', padding: 6, marginTop: -6, marginBottom: 10 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', textAlign: 'center' }}>
            PREVIEW — not saved with any request
          </Text>
        </View>
      )}

      {/* One page: the picture and the number side by side, then the spec. */}
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <View style={{ flex: 1, paddingRight: 14 }}>
          {props.mockup ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an <img>
            <Image src={props.mockup} style={{ width: '100%', height: 230, objectFit: 'cover' }} />
          ) : (
            <View style={{ height: 230, backgroundColor: '#f3f4f6' }} />
          )}
        </View>
        <View style={{ width: 170 }}>
          <View style={{ borderWidth: 1, borderColor: '#111827', padding: 10 }}>
            <Text style={styles.purposeLabel}>ESTIMATED PRICE</Text>
            {design.price == null ? (
              // A custom-quote type (SPEC §2.1): the Studio drew it, the team prices it.
              <>
                <Text style={styles.totalValue}>Custom quote</Text>
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 3 }}>
                  Signage.com prices this sign for each order
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.totalValue}>{pdfMoneyRound(design.price)}</Text>
                {design.turnaroundDays ? (
                  <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 3 }}>
                    About {design.turnaroundDays} days to make
                  </Text>
                ) : null}
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>Shipping included</Text>
              </>
            )}
          </View>
          {props.sideView && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.sectionTitle}>SIDE VIEW</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an <img> */}
              <Image src={props.sideView} style={{ width: 170, height: 120, objectFit: 'contain' }} />
            </View>
          )}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Text style={styles.sectionTitle}>SPECIFICATION</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {specs.map(([name, value]) => (
            <View key={name} style={{ ...styles.row, ...styles.lineRow, width: '48.5%' }} wrap={false}>
              <Text style={{ ...styles.tdMuted, width: 86, paddingVertical: 3 }}>{name}</Text>
              <Text style={{ ...styles.td, flex: 1, paddingVertical: 3 }}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      {design.materials && design.materials.length > 0 && (
        <View style={{ marginTop: 10 }} wrap={false}>
          <Text style={styles.sectionTitle}>MATERIALS</Text>
          <Text style={{ fontSize: 7.5, color: '#374151', lineHeight: 1.45 }}>
            {design.materials.slice(0, 10).map((material) => material.replace(/\s*\.\s*$/, '')).join(' · ')}
          </Text>
        </View>
      )}
    </DocumentShell>
  );
}
