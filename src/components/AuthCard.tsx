// The frame every account screen shares: sign in, two-factor, accept an
// invitation, forgot and reset a password (SPEC v2.3 §10.3).
//
// Deliberately plain and product-branded ("Franchise by Signage"). Brand
// portals (§10.4, phase D) put the brand's own chrome around the same card.

import Link from 'next/link';

export function AuthCard({
  title,
  subtitle,
  eyebrow = 'Franchise by Signage',
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Link href="/" className="text-xs font-medium uppercase tracking-widest text-brand">
        {eyebrow}
      </Link>
      <h1 className="mt-2 text-xl font-bold text-gray-900">{title}</h1>
      {subtitle && <div className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</div>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-sm text-gray-500">{footer}</div>}
    </main>
  );
}

export const fieldClass =
  'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
export const labelClass = 'block text-xs font-medium text-gray-700';
export const primaryButtonClass =
  'w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40';

export function FormError({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</p>;
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}
    </p>
  );
}
