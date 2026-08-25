// The corporate dashboard link (SPEC §10, §9 interface 6).
//
// Short by design. Nobody reads a magic-link email — they clicked "send me a
// link" ten seconds ago and want the button. What it does owe them is the two
// facts that make an unexpected copy of it safe to ignore: how long it lasts,
// and that it decides nothing.
//
// Sent AS THE BRAND like every other franchisor- and franchisee-facing message
// (src/lib/email/sender.ts): this is a franchisor looking at their own program,
// and mail from their own brand is what they expect to see.

import { EmailButton, EmailLayout, brandColors, type EmailBrand } from '../layout';

export interface CorporateLinkProps {
  brand: EmailBrand;
  /** `/{brand_slug}/corporate/{token}` — absolute, and the whole credential. */
  dashboardUrl: string;
  /** Whole days, from CORPORATE_LINK_TTL_DAYS. */
  expiresInDays: number;
  /** True when the requester asked from a device that already had a live link. */
  renewal: boolean;
}

export function CorporateLinkEmail({
  brand,
  dashboardUrl,
  expiresInDays,
  renewal,
}: CorporateLinkProps) {
  const colors = brandColors(brand);

  return (
    <EmailLayout
      brand={brand}
      preview={`Your ${brand.name} signage dashboard — ${expiresInDays} days of access, no password.`}
    >
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        {renewal ? 'A fresh link to your' : 'Your'} {brand.name} signage dashboard
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        Every location, every open request, and what the program has cost.
      </p>

      <EmailButton href={dashboardUrl} label="Open the dashboard" background={colors.primary} />

      <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
        The link works for {expiresInDays} days and needs no password — bookmark it. When it
        expires, ask for another from the same page.
      </p>

      {/* The reassurance that matters if this lands somewhere it should not:
          reading is all it can do. Approvals stay where SPEC §10 put them. */}
      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: '#6b7280' }}>
        It opens a read-only view. Approving signage still happens from the approval emails sent to
        your reviewer, so a copy of this link cannot approve anything on your behalf.
      </p>

      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: '#9ca3af' }}>
        If you did not ask for this, nothing has happened — the link is only useful to whoever asked
        for it. Tell your Signage.com manager and it will be switched off.
      </p>
    </EmailLayout>
  );
}
