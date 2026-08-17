// The scheduled half of the review SLA (SPEC §3.1).
//
// A route rather than a platform-specific job so it can be driven three ways:
// Vercel Cron in production, `npm run sla` on a laptop, and a plain HTTP call
// from anything else. The work is in src/lib/review/sla.tsx; this only decides
// who may ask for it.
//
// CRON_SECRET is required whenever it is set, and required outright in
// production: an unauthenticated endpoint that sends mail is a way to have your
// domain used to spam a franchisor.

import { runReviewSla } from '@/lib/review/sla';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret && process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (secret) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await runReviewSla();
  return Response.json({
    checked: result.checked,
    acted: result.lapses.filter((lapse) => lapse.handled).length,
    lapses: result.lapses,
  });
}
