// Chrome for the operator console.
//
// Signage.com's own surface, so it is NOT co-branded: the team works across
// every brand at once and each row says which brand it belongs to. The
// franchisee's screens are the ones that wear the brand.

import Link from 'next/link';

import { SignageLogo } from '@/components/SignageLogo';

import { getTeamMember } from '@/lib/auth/team';

import { signOut } from '../sign-in/actions';

/**
 * Never prerendered, at any point, for any reason.
 *
 * `/admin` is decided per request by who is holding the cookie, so a build-time
 * render of it is meaningless — and `authProvider()` says so out loud: with
 * NODE_ENV=production and no Supabase project it throws rather than quietly
 * falling back to the dev cookie. Prerendering therefore FAILED THE BUILD, which
 * is the correct behaviour from that guard and the wrong question to have asked
 * it. Forcing the segment dynamic asks the right one.
 *
 * It applies to the whole segment: every page under it is decided by the
 * caller's memberships.
 */
export const dynamic = 'force-dynamic';

// The console's five sections (DECISIONS #191).
const NAV = [
  { href: '/admin', label: 'Requests' },
  { href: '/admin/catalog', label: 'Catalog' },
  { href: '/admin/people', label: 'People' },
  { href: '/admin/outbox', label: 'Outbox' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getTeamMember();

  return (
    <>
      <header className="border-b border-gray-200 bg-gray-900">
        <div className="mx-auto flex page-wide flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5 text-sm text-gray-400">
            <SignageLogo onDark className="h-5 w-auto" />
            <span>operator console</span>
          </Link>
          {member && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-gray-400">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-gray-200 underline-offset-2 hover:underline">
                  {item.label}
                </Link>
              ))}
              {/* A support tool, not a daily one: findable, but set apart. */}
              <Link
                href="/admin/demo"
                className="border-l border-gray-700 pl-3 text-gray-400 underline-offset-2 hover:underline"
              >
                Walkthrough
              </Link>
              <span className="hidden border-l border-gray-700 pl-3 sm:inline">{member.name ?? member.email}</span>
              <form action={signOut}>
                <button type="submit" className="text-gray-300 underline-offset-2 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>
      {children}
    </>
  );
}
