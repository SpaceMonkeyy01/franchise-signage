// The invitation (SPEC v2.3 §10.3.1): the only way an account comes to exist.
//
// Its one job is the button. What it owes the reader besides is who asked, what
// they are being given, and how long the link lasts — and, because it creates an
// account, the sentence that makes an unexpected copy safe to ignore.

import { EmailButton, EmailLayout, brandColors, type EmailBrand } from '../layout';

export interface InvitationProps {
  brand: EmailBrand;
  /** "the Signage.com team", or a person's name. */
  invitedBy: string;
  /** What the account is for, in a phrase: "run the Signage.com operator console". */
  purpose: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function InvitationEmail({
  brand,
  invitedBy,
  purpose,
  acceptUrl,
  expiresInDays,
}: InvitationProps) {
  const colors = brandColors(brand);

  return (
    <EmailLayout brand={brand} preview={`${invitedBy} invited you to ${purpose}.`}>
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        You&rsquo;re invited
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
        {invitedBy} invited you to {purpose}. Accept to create your account: you&rsquo;ll choose a
        password, and that&rsquo;s how you sign in from then on.
      </p>

      <EmailButton href={acceptUrl} label="Accept and create your account" background={colors.primary} />

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
        The link works once, on any device, for {expiresInDays} days.
      </p>

      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: '#9ca3af' }}>
        Not expecting this? You can ignore it — no account exists until someone accepts.
      </p>
    </EmailLayout>
  );
}
