// Chrome for the operator console.
//
// Signage.com's own surface, so it is NOT co-branded: the team works across
// every brand at once and each row says which brand it belongs to. The
// franchisee's screens are the ones that wear the brand.

import Link from 'next/link';

import { getTeamMember } from '@/lib/auth/team';

import { signOut } from './login/actions';

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
 * It applies to the whole segment, the login screen included: that page calls
 * the same provider to decide which sign-in to render.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const member = await getTeamMember();

  return (
    <>
      <header className="border-b border-gray-200 bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/admin" className="text-sm font-semibold text-white">
            Signage.com <span className="font-normal text-gray-400">· operator console</span>
          </Link>
          {member && (
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
              {/* The outbox is a support tool, not a daily one — findable from
                  every screen, and never competing with the queue for attention. */}
              <Link href="/admin/outbox" className="text-gray-300 underline-offset-2 hover:underline">
                Outbox
              </Link>
              <span>{member.name ?? member.email}</span>
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
