// "A brand proposed a sign" (SPEC v2.4 §2.3) — to the Signage.com team.
//
// Internal mail, so it is Signage.com's, not co-branded. It says what was
// proposed and sends the reader to the one screen where it is priced.

import { EmailButton, EmailLayout, type EmailBrand } from '../layout';

export interface SignProposedProps {
  signage: EmailBrand;
  brandName: string;
  signName: string;
  signType: string;
  proposedBy: string;
  choices: [string, string][];
  note: string | null;
  catalogUrl: string;
}

export function SignProposedEmail(props: SignProposedProps) {
  return (
    <EmailLayout brand={props.signage} preview={`${props.brandName} proposed ${props.signName}`}>
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {props.brandName} proposed a new sign
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {props.signName} · {props.signType} · from {props.proposedBy}
      </p>

      {props.choices.length > 0 && (
        <table style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
          <tbody>
            {props.choices.map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: '2px 12px 2px 0', color: '#6b7280' }}>{label}</td>
                <td style={{ padding: '2px 0' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.note && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151' }}>&ldquo;{props.note}&rdquo;</p>
      )}
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        It stays out of the brand&rsquo;s catalog until it is priced and approved.
      </p>

      <EmailButton href={props.catalogUrl} label="Review and price it" background="#111827" />
    </EmailLayout>
  );
}
