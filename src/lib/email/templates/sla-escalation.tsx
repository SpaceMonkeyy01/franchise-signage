// "This has been waiting" (SPEC §3.1 sla_action = escalate).
//
// Short on purpose. It is not a second approval email — it does not carry
// buttons or item detail, because the person receiving it may not be the
// approver and should not be nudged into deciding on someone else's behalf. It
// says what is waiting, for how long, and where the actual approval lives.

import { EmailButton, EmailLayout, brandColors, type EmailBrand } from '../layout';

export interface SlaEscalationProps {
  brand: EmailBrand;
  locationName: string;
  requestCode: string;
  pendingCount: number;
  daysWaiting: number;
  slaDays: number;
  reviewerEmail: string;
  reviewUrl: string;
}

export function SlaEscalationEmail(props: SlaEscalationProps) {
  const colors = brandColors(props.brand);

  return (
    <EmailLayout
      brand={props.brand}
      preview={`${props.pendingCount} sign(s) have been awaiting approval for ${props.daysWaiting} days`}
    >
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        Signage approval is overdue
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {props.locationName} · {props.requestCode}
      </p>

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        {props.pendingCount} sign(s) have been waiting on {props.reviewerEmail} for{' '}
        <strong>{props.daysWaiting} days</strong>, past the {props.slaDays}-day review window
        configured for {props.brand.name}.
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        Nothing has been decided and nothing has been approved on anyone&rsquo;s behalf. The
        franchisee&rsquo;s other signs — the standard package and any like-for-like replacements —
        are already proceeding.
      </p>

      <EmailButton href={props.reviewUrl} label="Open the request" background={colors.primary} />
    </EmailLayout>
  );
}
