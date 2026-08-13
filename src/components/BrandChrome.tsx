// Co-branded chrome. The franchisee's brand comes first and Signage.com sits
// underneath it in small type — the franchisee has a relationship with their
// franchisor, and Signage.com is the operator behind it (SPEC §1, and the
// header docs/flow-demo.jsx uses).

import Link from 'next/link';

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
    }`}</style>
  );
}

export function BrandHeader({ brand, backHref }: { brand: BrandPublic; backHref?: string }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--color-brand-light)' }}
        >
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-6 w-6 object-contain" />
          ) : (
            <LeafMark />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold" style={{ color: 'var(--color-brand-dark)' }}>
            {brand.name}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            Powered by <span className="font-semibold text-gray-500">Signage.com</span>
          </p>
        </div>
        {backHref && (
          <Link
            href={backHref}
            className="ml-auto text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            ← Back
          </Link>
        )}
      </div>
    </header>
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
