// The parts every franchisee notification repeats.
//
// Seven templates (SPEC §9 interface 5) all open the same way — which location,
// which request — and all end with the same button, because a franchisee has no
// account and no dashboard: the tokenized link IS the product. Sharing the three
// pieces below keeps that link identical in all seven rather than seven slightly
// different attempts at the same paragraph.
//
// Each notification still gets its own file. The copy is the part that differs,
// and the copy is the part that matters.

import { EmailButton, brandColors, type EmailBrand } from '../../layout';

export interface FranchiseeEmailBase {
  brand: EmailBrand;
  /** Their first name where we have one — these are addressed to a person. */
  requesterName: string | null;
  locationName: string;
  requestCode: string;
  /** `/{brand_slug}/request/{access_token}` — absolute, and their only way in. */
  requestUrl: string;
  /**
   * Which half of a split this message is about (SPEC §6, amended v2.2).
   *
   * Null whenever the request has one package, which is the ordinary case —
   * naming a package there would introduce a word the franchisee has never been
   * told. On a split it is what stops "shipped" reading as "all of it shipped".
   */
  packageLabel: string | null;
}

export function Heading({
  title,
  locationName,
  requestCode,
  packageLabel,
}: {
  title: string;
  locationName: string;
  requestCode: string;
  packageLabel?: string | null;
}) {
  return (
    <>
      <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#111827' }}>{title}</p>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
        {locationName} · {requestCode}
        {packageLabel && (
          <>
            {' · '}
            <span style={{ color: '#374151', fontWeight: 600 }}>{packageLabel}&rsquo;s part</span>
          </>
        )}
      </p>
    </>
  );
}

export function Greeting({ name }: { name: string | null }) {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return (
    <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>Hi {first},</p>
  );
}

/**
 * The one button.
 *
 * Deliberately singular in every template: a franchisee who is told two things
 * to do next does neither. Whatever the email is about, the answer is the same
 * page.
 */
export function OpenRequest({
  brand,
  url,
  label = 'Open your request',
  note,
}: {
  brand: EmailBrand;
  url: string;
  label?: string;
  note?: string;
}) {
  const colors = brandColors(brand);
  return (
    <div style={{ marginTop: 16 }}>
      <EmailButton href={url} label={label} background={colors.primary} />
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
        {note ?? 'This link is yours — no password, no account. Keep the email to come back to it.'}
      </p>
    </div>
  );
}

/** A framed aside: the change-request note, a decline reason, a quote total. */
export function Callout({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'bad';
}) {
  const palette = {
    neutral: { background: '#f9fafb', color: '#374151' },
    warning: { background: '#fffbeb', color: '#92400e' },
    bad: { background: '#fff1f2', color: '#9f1239' },
  }[tone];
  return (
    <div
      style={{
        margin: '0 0 14px',
        padding: '10px 12px',
        borderRadius: 8,
        fontSize: 13,
        ...palette,
      }}
    >
      {children}
    </div>
  );
}
