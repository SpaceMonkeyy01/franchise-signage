'use client';

// The console's sections, with the one you are in marked (DECISIONS #199).
// A request belongs to Requests; the walkthrough's links view to Walkthrough.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin', label: 'Requests', match: (path: string) => path === '/admin' || path.startsWith('/admin/request/') },
  { href: '/admin/catalog', label: 'Catalog' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/outbox', label: 'Outbox' },
  { href: '/admin/settings', label: 'Settings' },
];

function NavLink({ href, label, active, quiet }: { href: string; label: string; active: boolean; quiet?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-2 py-1 transition-colors ${
        active
          ? 'bg-white/10 font-semibold text-white'
          : quiet
            ? 'text-gray-400 hover:text-gray-200'
            : 'text-gray-200 hover:bg-white/5 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

export function AdminNav() {
  const path = usePathname() ?? '';
  return (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.label}
          active={item.match ? item.match(path) : path === item.href || path.startsWith(`${item.href}/`)}
        />
      ))}
      {/* A support tool, not a daily one: findable, but set apart. */}
      <span className="border-l border-gray-700 pl-1">
        <NavLink href="/admin/demo" label="Walkthrough" quiet active={path.startsWith('/admin/demo')} />
      </span>
    </>
  );
}
