// The approval email (SPEC §9 interface 3, docs/flow-demo.jsx's reviewer view).
//
// The shape carries the argument the whole program makes, so it is deliberate:
// the FIRST line says how many items are proceeding without the reviewer, and
// only then does it list what actually needs them. A franchisor who opens this
// should see that the standard package never lands on their desk.
//
// One decision per item, never one for the request: approving four signs and
// declining a fifth is the normal case (SPEC §7).

import { EmailButton, EmailLayout, money, brandColors, type EmailBrand } from '../layout';

export interface ReviewItem {
  id: string;
  name: string;
  specSummary: string | null;
  origin: string;
  sizing: string | null;
  tbdFields: string[];
  exceptionIssue: string | null;
  siteNotes: string | null;
  price: string | null;
  vendorLabel: string;
  mockupUrl: string | null;
}

export interface ReviewRequestedProps {
  brand: EmailBrand;
  locationName: string;
  requestCode: string;
  /** Set on a re-review after the franchisee answered a change request. */
  packageVersion: number;
  autoApprovedCount: number;
  items: ReviewItem[];
  reviewUrl: string;
  expiresAt: string;
  slaDays: number;
}

const ORIGIN_LABEL: Record<string, string> = {
  standard: 'Standard package',
  addon: 'Add-on',
  exception: 'Exception — a standard sign that will not work at this site',
  replacement: 'Like-for-like replacement',
};

export function ReviewRequestedEmail(props: ReviewRequestedProps) {
  const colors = brandColors(props.brand);
  const resubmission = props.packageVersion > 1;

  return (
    <EmailLayout
      brand={props.brand}
      preview={`${props.items.length} sign(s) need your approval — ${props.locationName}`}
      footer={
        <p style={{ margin: 0 }}>
          These buttons expire on {new Date(props.expiresAt).toLocaleDateString('en-US')}, and are
          tied to this version of the request — if the franchisee edits it you will get a fresh
          email and this one stops working. If nothing is decided within{' '}
          {props.slaDays === 1 ? 'a day' : `${props.slaDays} days`} we will follow up.
        </p>
      }
    >
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {resubmission ? 'Updated and back for your review' : 'Signage approval needed'}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {props.locationName} · {props.requestCode}
        {resubmission && ` · package v${props.packageVersion}`}
      </p>

      {/* The point of the program, stated before anything is asked of them. */}
      {props.autoApprovedCount > 0 && (
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
          <strong>{props.autoApprovedCount} item(s) are already proceeding</strong> — they are
          standard package signs or like-for-like replacements against specs you have already
          approved. Nothing below is one of those.
        </p>
      )}

      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
        {props.items.length === 1
          ? 'One item needs a decision:'
          : `${props.items.length} items need a decision. Each is decided on its own — declining one does not hold up the rest:`}
      </p>

      {props.items.map((item) => (
        <table
          key={item.id}
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          width="100%"
          style={{
            marginBottom: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 10,
          }}
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
                  {item.name}
                </p>
                {item.specSummary && (
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>
                    {item.specSummary}
                  </p>
                )}

                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#374151' }}>
                  {ORIGIN_LABEL[item.origin] ?? item.origin} · {item.vendorLabel} ·{' '}
                  <strong>{money(item.price)}</strong>
                  {item.sizing && ` · ${item.sizing}`}
                </p>

                {item.exceptionIssue && (
                  <p
                    style={{
                      margin: '0 0 6px',
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: '#fff1f2',
                      color: '#9f1239',
                      fontSize: 12,
                    }}
                  >
                    Why the standard sign will not work here: {item.exceptionIssue}
                  </p>
                )}
                {item.siteNotes && (
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#374151' }}>
                    From the franchisee: {item.siteNotes}
                  </p>
                )}
                {item.tbdFields.length > 0 && (
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#92400e' }}>
                    Still to be confirmed: {item.tbdFields.join(', ')} — the Signage.com team is
                    chasing it, and it does not block your decision.
                  </p>
                )}

                <div style={{ marginTop: 10 }}>
                  <EmailButton
                    href={`${props.reviewUrl}?item=${item.id}&action=approve`}
                    label="Approve"
                    background={colors.primary}
                  />
                  <EmailButton
                    href={`${props.reviewUrl}?item=${item.id}&action=changes`}
                    label="Request changes"
                    background="#d97706"
                  />
                  <EmailButton
                    href={`${props.reviewUrl}?item=${item.id}&action=decline`}
                    label="Decline"
                    background="#e11d48"
                  />
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
                  Requesting changes needs a note — you will be asked for one.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      ))}

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#6b7280' }}>
        Prefer to see everything at once?{' '}
        <a href={props.reviewUrl} style={{ color: colors.dark }}>
          Open the full request
        </a>
        .
      </p>
    </EmailLayout>
  );
}
