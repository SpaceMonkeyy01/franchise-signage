// The welcome email (SPEC §8d) — the first thing a franchisee ever sees.
//
// It is sent at agreement signing, the moment corporate registers their email,
// and it is not a notification: there is no request, no location, and no lease.
// That is why it does not use the franchisee shell, whose every prop is
// request-scoped. What exists at this moment is a person, a brand, and a
// question their lender is about to ask.
//
// SPEC §8d fixes the payload precisely: "concept drawings and a signage number
// for the bank" — the DID (§8c) and the budget one-pager (§8b). Nothing about
// ordering signs, which is months away and would read as a sales email at the
// one moment goodwill is highest.
//
// The DID is Session 8 and has no destination yet, so it appears here as what it
// honestly is — the stage after this one — with no button. An email whose main
// link 404s is worse than an email that says "not yet".
//
// Since spec v2.3 (§10.3.1) it also carries the franchisee's account invitation,
// and that is its main button: the account is what outlasts this email. The
// registration's own page stays as a quieter second link, so the budget figures
// are one click away even for someone not ready to choose a password.

import { EmailButton, EmailLayout, brandColors, type EmailBrand } from '../layout';
import { budgetMoney, type FormatBudget } from '../../budget';

export interface WelcomeProps {
  brand: EmailBrand;
  /** Their name where corporate supplied one; registration only requires an email. */
  name: string | null;
  /** One row per format the brand has a standard package for (SPEC §3.2). */
  budgets: FormatBudget[];
  /** `/{brand_slug}/welcome/{access_token}` — the budget figures, no account needed. */
  welcomeUrl: string;
  /**
   * The owner invitation (`create`), or — when they already have an account —
   * where to sign in (`sign_in`). SPEC v2.3 §10.3.1.
   */
  account: { url: string; kind: 'create' | 'sign_in' };
}

export function WelcomeEmail({ brand, name, budgets, welcomeUrl, account }: WelcomeProps) {
  const colors = brandColors(brand);
  const first = name?.trim().split(/\s+/)[0] ?? null;
  // The caveat is shared rather than repeated per row: every format quotes the
  // same custom items, and three identical footnotes read as three problems.
  const customLines = Math.max(0, ...budgets.map((budget) => budget.customLines));

  return (
    <EmailLayout
      brand={brand}
      preview={`Your signage numbers for the business plan, and what comes when you have a site.`}
    >
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        Signage for your new {brand.name}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        Everything below is for the planning stage.
      </p>

      {first && (
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>Hi {first},</p>
      )}

      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
        Congratulations on signing with {brand.name}. Signage is one of the line items your lender
        will ask about, and this is where you get the number — long before there is a building to
        put a sign on.
      </p>

      {budgets.length > 0 && (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#111827' }}>
            The signage number for your business plan
          </p>
          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            width="100%"
            style={{ margin: '0 0 10px', fontSize: 13 }}
          >
            <tbody>
              {budgets.map((budget) => (
                <tr key={budget.format}>
                  <td
                    style={{
                      padding: '7px 0',
                      borderBottom: '1px solid #f3f4f6',
                      color: '#374151',
                    }}
                  >
                    <strong style={{ color: '#111827' }}>{budget.formatLabel}</strong>{' '}
                    <span style={{ color: '#9ca3af' }}>· {budget.packageLabel}</span>
                  </td>
                  <td
                    style={{
                      padding: '7px 0',
                      borderBottom: '1px solid #f3f4f6',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: colors.dark,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {budgetMoney(budget.priced)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.6, color: '#6b7280' }}>
            The standard {brand.name} package at each location format, at today&apos;s prices. Which
            one applies depends on the site you end up with.
            {customLines > 0 && (
              <>
                {' '}
                {customLines === 1 ? 'One item is' : `${customLines} items are`} quoted per site and
                {customLines === 1 ? ' is' : ' are'} not in these figures — a pylon or monument sign
                cannot be priced before anyone knows the frontage or the local sign code.
              </>
            )}{' '}
            <strong>An estimate, not a quote.</strong>
          </p>
        </>
      )}

      <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#111827' }}>
        When you have a candidate site
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
        Once you are at letter of intent on a specific address, {brand.name} and Signage.com produce
        concept drawings of your storefront and a site-specific budgetary quote against the real
        frontage — the pair a lender works from during underwriting. Tell your {brand.name} contact
        when you are close and we will open it here.
      </p>

      <div style={{ marginTop: 16 }}>
        <EmailButton
          href={account.url}
          label={account.kind === 'create' ? 'Create your account' : `Sign in to ${brand.name}`}
          background={colors.primary}
        />
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.6, color: '#6b7280' }}>
          {account.kind === 'create'
            ? `You choose a password, and your ${brand.name} signage lives in one place from then on — these figures now, your store once there is a lease. The link works once, for 14 days.`
            : `You already have an account — these figures are there too.`}
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6b7280' }}>
          Just want the numbers?{' '}
          <a href={welcomeUrl} style={{ color: colors.dark }}>
            {budgets.length > 0 ? 'Get your budget sheet' : 'Open your signage page'}
          </a>{' '}
          — no account needed.
        </p>
      </div>
    </EmailLayout>
  );
}
