// Co-branded chrome. The franchisee's brand comes first and Signage.com sits
// underneath it in small type — the franchisee has a relationship with their
// franchisor, and Signage.com is the operator behind it (SPEC §1, and the
// header docs/flow-demo.jsx uses).

import Link from 'next/link';

import { HeaderShell } from '@/components/HeaderShell';
import { SignageLogo } from '@/components/SignageLogo';

import type { BrandPublic } from '@/lib/db/queries';

/**
 * Per-brand theming.
 *
 * The palette is a set of CSS variables the whole tree reads, so a second brand
 * re-skins every screen by shipping different `brand_colors` — nothing is
 * hardcoded to Freshbites green outside the seed.
 */
export function BrandTheme({ brand }: { brand: BrandPublic }) {
  const { primary, primaryDark, primaryLight } = brand.brand_colors ?? {};
  if (!primary) return null;
  return (
    <style>{`:root{
      --color-brand:${primary};
      --color-brand-dark:${primaryDark ?? primary};
      --color-brand-light:${primaryLight ?? '#f1f5f9'};
    }
    body{--page-tint:${primary};}`}</style>
  );
}

export function BrandHeader({
  brand,
  backHref,
  account,
}: {
  brand: BrandPublic;
  backHref?: string;
  /** Who is signed in, and a way out (SPEC v2.3). Omitted on link-only pages. */
  account?: React.ReactNode;
}) {
  return (
    <>
      {/* A wash of the brand's colour from the top of the page, behind the
          header and fading into the grid: the brand's pages open with its
          colour, and header and page read as one surface. It scrolls away. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 print:hidden"
        style={{
          background:
            'linear-gradient(to bottom, color-mix(in srgb, var(--color-brand) 13%, transparent), color-mix(in srgb, var(--color-brand) 4%, transparent) 55%, transparent)',
        }}
      />
      {/* No bar at the top of the page — the header sits on the wash; a
          frosted bar appears once content scrolls under it (HeaderShell). A
          stripe of the brand colour finishes the top edge. */}
      <HeaderShell>
        <div
          aria-hidden="true"
          className="h-1"
          style={{ background: 'linear-gradient(90deg, var(--color-brand-dark), var(--color-brand))' }}
        />
        <div className="mx-auto flex page-wide items-center gap-3 px-4 py-3 sm:px-6">
          {brand.logo_url ? (
            // A brand's own wordmark says its name; Signage.com follows it, smaller.
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logo_url} alt={brand.name} className="h-8 w-auto shrink-0 sm:h-9" />
              <span className="h-7 w-px shrink-0 bg-gray-300/70" aria-hidden="true" />
              <p className="flex flex-col gap-0.5 text-[10px] uppercase leading-tight tracking-wider text-gray-500">
                Powered by
                <SignageLogo className="h-3.5 w-auto" />
              </p>
            </div>
          ) : (
            <>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--color-brand-light)' }}
              >
                <LeafMark />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
                  {brand.name}
                </p>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
                  Powered by <SignageLogo className="h-3 w-auto" />
                </p>
              </div>
            </>
          )}
          <div className="ml-auto flex items-center gap-4">
            {backHref && (
              <Link href={backHref} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
                ← Back
              </Link>
            )}
            {account}
          </div>
        </div>
      </HeaderShell>
    </>
  );
}

/** Placeholder mark until a brand supplies a logo asset. */
function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12 21c-4-3-7-6.5-7-10.5A7 7 0 0 1 19 6c0 5-3.5 11-7 15Z"
        fill="var(--color-brand)"
        opacity="0.9"
      />
      <path d="M12 21V8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
