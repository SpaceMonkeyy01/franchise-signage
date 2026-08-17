// Shared chrome for every template, and the renderer.
//
// Plain inline-styled markup rather than a component library: mail clients
// support roughly 2003-era CSS, and the one thing this must never do is arrive
// looking broken at a franchisor who is deciding whether to trust the program.
//
// Co-branded exactly as the app is (SPEC §1): the brand's name and colour first,
// Signage.com underneath in small type.

export interface EmailBrand {
  name: string;
  brand_colors?: { primary?: string; primaryDark?: string; primaryLight?: string } | null;
}

export function brandColors(brand: EmailBrand) {
  return {
    primary: brand.brand_colors?.primary ?? '#111827',
    dark: brand.brand_colors?.primaryDark ?? brand.brand_colors?.primary ?? '#111827',
    light: brand.brand_colors?.primaryLight ?? '#f3f4f6',
  };
}

export function EmailLayout({
  brand,
  preview,
  children,
  footer,
}: {
  brand: EmailBrand;
  /** The line mail clients show next to the subject. */
  preview: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const colors = brandColors(brand);

  return (
    <div style={{ background: '#f6f7f9', padding: '24px 0', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden', opacity: 0 }}>
        {preview}
      </span>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{ maxWidth: 600, margin: '0 auto' }}
      >
        <tbody>
          <tr>
            <td style={{ padding: '0 16px 12px' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.dark }}>
                {brand.name}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#9ca3af',
                }}
              >
                Powered by Signage.com
              </p>
            </td>
          </tr>
          <tr>
            <td
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 20,
              }}
            >
              {children}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '12px 16px', fontSize: 11, color: '#9ca3af' }}>
              {footer ?? (
                <p style={{ margin: 0 }}>
                  Sent by Signage.com on behalf of {brand.name}. Reply to this email and a human
                  reads it.
                </p>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A link that has to look like a button in clients with no CSS to speak of. */
export function EmailButton({
  href,
  label,
  background,
  color = '#ffffff',
}: {
  href: string;
  label: string;
  background: string;
  color?: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '8px 14px',
        marginRight: 8,
        borderRadius: 8,
        background,
        color,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  );
}

/**
 * Render a template to the HTML that gets sent.
 *
 * `react-dom/server` is imported at call time, not at module scope: Next refuses
 * a static import of it anywhere in a Server Component's graph (it can deadlock
 * a streaming render), and these templates are reached from Server Actions. The
 * dynamic import keeps the JSX templates CLAUDE.md asks for without dragging the
 * renderer into the page graph.
 */
export async function render(element: React.ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  return `<!doctype html><html><body style="margin:0">${renderToStaticMarkup(element)}</body></html>`;
}

export function money(value: string | number | null): string {
  if (value === null) return 'Custom quote';
  const amount = typeof value === 'string' ? Number(value) : value;
  return Number.isNaN(amount) ? 'Custom quote' : `$${amount.toLocaleString('en-US')}`;
}
