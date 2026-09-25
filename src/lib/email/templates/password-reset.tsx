// A password reset (SPEC v2.3 §10.3.3).
//
// Sent through the same pipeline as every other message rather than by Supabase,
// and the link is a token this app resolves, so it works on a different device
// from the one that asked for it (DECISIONS #108).

import { EmailButton, EmailLayout, brandColors, type EmailBrand } from '../layout';

export interface PasswordResetProps {
  brand: EmailBrand;
  resetUrl: string;
  expiresInMinutes: number;
}

export function PasswordResetEmail({ brand, resetUrl, expiresInMinutes }: PasswordResetProps) {
  const colors = brandColors(brand);

  return (
    <EmailLayout brand={brand} preview="Choose a new password.">
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        Reset your password
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
        Someone asked to reset the password on this account. If it was you, choose a new one.
      </p>

      <EmailButton href={resetUrl} label="Choose a new password" background={colors.primary} />

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
        The link works once, for {expiresInMinutes} minutes.
      </p>
      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: '#9ca3af' }}>
        If you didn&rsquo;t ask, ignore this — your password stays as it is.
      </p>
    </EmailLayout>
  );
}
