// "Your proposed sign was approved / declined" (SPEC v2.4 §2.3) — to the
// brand admin who proposed it. Sent as the brand, like everything a brand's
// people receive.

import { EmailButton, EmailLayout, brandColors, money, type EmailBrand } from '../layout';

export interface SignReviewedProps {
  brand: EmailBrand;
  signName: string;
  approved: boolean;
  price: string | null;
  note: string | null;
  signsUrl: string;
}

export function SignReviewedEmail(props: SignReviewedProps) {
  const colors = brandColors(props.brand);
  return (
    <EmailLayout
      brand={props.brand}
      preview={props.approved ? `${props.signName} is live` : `${props.signName} was not approved`}
    >
      <p style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {props.approved ? `${props.signName} is live` : `${props.signName} needs another look`}
      </p>
      {props.approved ? (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
          Signage.com approved it at{' '}
          <strong>{props.price === null ? 'a custom quote' : `${money(props.price)} (estimate)`}</strong>.
          Franchisees can order it now, and you can add it to a standard package.
        </p>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
          Signage.com did not approve it as proposed. You can revise it and send it again.
        </p>
      )}
      {props.note && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151' }}>
          <span style={{ color: '#6b7280' }}>From Signage.com: </span>
          {props.note}
        </p>
      )}
      <EmailButton href={props.signsUrl} label="Open your signs" background={colors.primary} />
    </EmailLayout>
  );
}
