// The quote package (SPEC §4, §9 interface 4).
//
// This is the only email in the set that leaves the program: it goes to an
// outside fabricator, or to corporate to forward, or to Signage.com's own
// production desk. Two things follow from that.
//
// First, nothing token-shaped goes in it. The franchisee's access token and the
// reviewer's link are credentials, and a vendor is not a party to either — a
// forwarded email must not hand a fabricator the franchisee's workspace.
//
// Second, it has to be usable as a quoting document by someone with no account
// and no context: who the brand is, where the site is, what to build, to what
// spec, how many, and where to reply. A vendor should be able to price it
// without asking a question, and should never have to guess which numbers are
// ours and which are theirs to fill in.

import { EmailLayout, money, brandColors, type EmailBrand } from '../layout';

export interface VendorPackageItem {
  id: string;
  name: string;
  specSummary: string | null;
  /** The brand's pinned spec — the part a vendor may not vary. */
  pinnedAttributes: Record<string, unknown>;
  /** Per-site dimensions, or null when the team is still confirming them. */
  sizing: string | null;
  tbdFields: string[];
  siteNotes: string | null;
  /** Our estimate, shown only for direct-priced items; null → vendor quotes it. */
  price: string | null;
  mockupUrl: string | null;
  /** Site photos and anything else attached to this specific item. */
  attachments: { name: string; url: string }[];
}

export interface VendorPackageProps {
  brand: EmailBrand;
  /** Who the package is addressed to — a company, not a person (SPEC §3.1). */
  recipientName: string;
  /** `corporate_first` addresses corporate, who forward it themselves (SPEC §4). */
  recipientKind: string;
  locationName: string;
  locationCode: string;
  addressLines: string[];
  format: string;
  openingDate: string | null;
  requestCode: string;
  items: VendorPackageItem[];
  /** Request-level files: lease exhibit, landlord criteria, survey photos. */
  requestFiles: { name: string; kind: string; url: string }[];
  /** Where the vendor replies. Never a link into the portal. */
  replyTo: string;
  /** Set on the internal tail only — the turnaround we have already promised. */
  tat: string | null;
  pricedTotal: number;
  pricedCount: number;
  manualCount: number;
}

const FORMAT_LABEL: Record<string, string> = {
  inline: 'Inline (in-line storefront)',
  endcap: 'Endcap (two elevations)',
  freestanding: 'Freestanding (standalone building)',
};

const FILE_KIND_LABEL: Record<string, string> = {
  site_photo: 'Site photo',
  lease_exhibit: 'Lease sign exhibit',
  landlord_criteria: 'Landlord sign criteria',
  survey: 'Site survey',
  mockup: 'Mockup',
  other: 'Attachment',
};

/** `{ return_color: 'match_logo' }` → `Return color: match logo`. */
function attributeLines(attributes: Record<string, unknown>): string[] {
  return Object.entries(attributes).map(([key, value]) => {
    const label = key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const shown =
      typeof value === 'boolean'
        ? value
          ? 'required'
          : 'not required'
        : String(value).replace(/_/g, ' ');
    return `${label}: ${shown}`;
  });
}

export function VendorPackageEmail(props: VendorPackageProps) {
  const colors = brandColors(props.brand);
  const toCorporate = props.recipientKind === 'corporate_first';
  const internal = props.recipientKind === 'signage_com';

  return (
    <EmailLayout
      brand={props.brand}
      preview={`Quote request — ${props.items.length} ${
        props.items.length === 1 ? 'sign' : 'signs'
      } for ${props.locationName}`}
      footer={
        <p style={{ margin: 0 }}>
          Sent by Signage.com on behalf of {props.brand.name}. Reply to {props.replyTo} with your
          quote, or with any question about the spec — a human reads it.
        </p>
      }
    >
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {toCorporate ? 'Signage package for your vendor' : 'Request for quote'}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {props.recipientName} · {props.requestCode}
      </p>

      {toCorporate && (
        <p
          style={{
            margin: '0 0 16px',
            padding: '10px 12px',
            borderRadius: 8,
            background: colors.light,
            color: colors.dark,
            fontSize: 13,
          }}
        >
          These items are approved and ready to fabricate. {props.brand.name} routes signage through
          your own vendor, so this package is for you to forward — everything a fabricator needs to
          quote it is below.
        </p>
      )}

      {/* The site, before the items. A fabricator's first question is where. */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{ marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 10 }}
      >
        <tbody>
          <tr>
            <td style={{ padding: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#9ca3af' }}>
                Site
              </p>
              {/* Not `brand — location`: location names already carry the brand
                  ("Freshbites — Oak Plaza"), and doubling it reads as a bug to
                  the outside company receiving this. */}
              <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
                {props.locationName}
              </p>
              {props.addressLines.map((line) => (
                <p key={line} style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                  {line}
                </p>
              ))}
              {props.addressLines.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                  Address to be confirmed — ask before scheduling a survey.
                </p>
              )}
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                {props.locationCode} · {FORMAT_LABEL[props.format] ?? props.format}
                {props.openingDate &&
                  ` · target opening ${new Date(props.openingDate).toLocaleDateString('en-US')}`}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
        {props.items.length === 1 ? 'One sign' : `${props.items.length} signs`}, approved by{' '}
        {props.brand.name} corporate. The specs below are the brand standard and are not open to
        substitution — if something cannot be built as written, say so rather than substituting.
      </p>

      {props.items.map((item, index) => {
        const attributes = attributeLines(item.pinnedAttributes);
        return (
          <table
            key={item.id}
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            width="100%"
            style={{ marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 10 }}
          >
            <tbody>
              <tr>
                <td style={{ padding: 14 }}>
                  {item.mockupUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.mockupUrl}
                      alt=""
                      width={280}
                      style={{ display: 'block', marginBottom: 10, borderRadius: 6, maxWidth: '100%' }}
                    />
                  )}

                  <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
                    {index + 1}. {item.name}
                  </p>
                  {item.specSummary && (
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>
                      {item.specSummary}
                    </p>
                  )}

                  {attributes.length > 0 && (
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12, color: '#374151' }}>
                      {attributes.map((line) => (
                        <li key={line} style={{ marginBottom: 2 }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#374151' }}>
                    <strong>Size:</strong>{' '}
                    {item.sizing ?? 'to be confirmed — quote against the mockup and flag it'}
                  </p>

                  {item.tbdFields.length > 0 && (
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: '#92400e' }}>
                      Not yet confirmed: {item.tbdFields.join(', ')}. We are chasing these and will
                      send them through; price the rest.
                    </p>
                  )}
                  {item.siteNotes && (
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: '#374151' }}>
                      Site note: {item.siteNotes}
                    </p>
                  )}

                  {/* Our estimate is context, never a ceiling on their quote —
                      and for standin-priced items we do not have one at all. */}
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>
                    {item.price === null
                      ? 'No budget figure on this one — please quote it.'
                      : `Budgeted at ${money(item.price)} (our estimate, for context — quote it as you see it).`}
                  </p>

                  {item.attachments.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#374151' }}>
                      Attached:{' '}
                      {item.attachments.map((file, fileIndex) => (
                        <span key={file.url}>
                          {fileIndex > 0 && ', '}
                          <a href={file.url} style={{ color: colors.dark }}>
                            {file.name}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        );
      })}

      {props.requestFiles.length > 0 && (
        <>
          <p style={{ margin: '16px 0 6px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
            Site documents
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 12, color: '#374151' }}>
            {props.requestFiles.map((file) => (
              <li key={file.url} style={{ marginBottom: 3 }}>
                <a href={file.url} style={{ color: colors.dark }}>
                  {file.name}
                </a>{' '}
                — {FILE_KIND_LABEL[file.kind] ?? file.kind}
              </li>
            ))}
          </ul>
        </>
      )}

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb' }}
      >
        <tbody>
          <tr>
            <td style={{ padding: 14, fontSize: 12, color: '#374151' }}>
              <p style={{ margin: '0 0 4px' }}>
                <strong>What we need back:</strong> a line-by-line quote against the numbering above,
                with lead time. Permits and landlord approval are handled separately — quote
                fabrication and installation only, and note anything you would need us to obtain.
              </p>
              {props.manualCount > 0 && (
                <p style={{ margin: '0 0 4px' }}>
                  {props.manualCount === props.items.length
                    ? props.items.length === 1
                      ? 'This item carries no budget figure — price it entirely as you see it.'
                      : 'None of these carry a budget figure — price them entirely as you see them.'
                    : `${props.manualCount} of these carry no budget figure — price them entirely as you see them.`}
                </p>
              )}
              {props.pricedCount > 0 && (
                <p style={{ margin: '0 0 4px', color: '#6b7280' }}>
                  For reference, our budget across the {props.pricedCount} priced{' '}
                  {props.pricedCount === 1 ? 'item' : 'items'} is{' '}
                  {money(props.pricedTotal)}.
                </p>
              )}
              {internal && props.tat && (
                <p style={{ margin: '0 0 4px' }}>
                  Committed turnaround to the franchisee: <strong>{props.tat}</strong>.
                </p>
              )}
              <p style={{ margin: 0 }}>
                Reply to <a href={`mailto:${props.replyTo}`} style={{ color: colors.dark }}>{props.replyTo}</a> and
                quote {props.requestCode} — please do not contact the franchisee directly.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
