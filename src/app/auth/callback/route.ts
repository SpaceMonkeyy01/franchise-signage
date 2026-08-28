// Completing the magic link (SPEC §10).
//
// `sendMagicLink` mints the link and `supabaseEmail()` reads the session back,
// but nothing ever turned the first into the second: the link lands here with a
// one-time credential in the query, and it has to be exchanged for a session
// before any cookie exists. Without this handler a correct link bounces to
// /admin, finds no session, and returns the team member to the login screen —
// which is exactly what it did until the Auth path was first run for real.
//
// It is a Route Handler rather than a page because only a Route Handler (or a
// Server Function) may write cookies: `supabaseEmail()` deliberately ignores
// cookie writes, since a Server Component cannot perform them, and this is the
// place its comment refers to.
//
// **This handler authorizes nothing.** It establishes WHO the caller is; whether
// that person is on the team is decided in the one place it is always decided,
// `getTeamMember()`, on every request. A stranger who signs in successfully
// still reaches nothing.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  // Where to land afterwards. Same-origin only: this value arrives in a URL that
  // was mailed, and an open redirect on the end of an authentication flow is
  // worth more to an attacker than on any other page.
  const requested = url.searchParams.get('next') ?? '/admin';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/admin';

  // Supabase sends one shape or the other depending on the project's email
  // template: PKCE links carry `code`, and the token-hash templates carry
  // `token_hash` + `type`. Both are accepted so that changing the template does
  // not silently break sign-in.
  if (!code && !(tokenHash && type)) {
    redirect('/admin/login?error=link');
  }

  const { createServerClient } = await import('@supabase/ssr');
  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => store.set(name, value, options)),
      },
    },
  );

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });

  // The link is single-use and expires, so a failure here is ordinary — a
  // second click, or a slow morning — and says so rather than showing a stack.
  if (error) redirect('/admin/login?error=link');

  redirect(next);
}
