// The walkthrough — every participant's view of one request, in one place.
//
// The flow demo (docs/flow-demo.jsx) is a single screen with a persona switcher
// over shared state. The product cannot be that, on purpose: franchisees and
// corporate hold tokenized links, reviewers act from email, and nobody logs in
// but the team (SPEC §10). What it CAN be is this page — the real screens, each
// reached by its real credential, framed side by side under the demo's switcher,
// so a request can be followed from the franchisee to the queue to the reviewer's
// inbox to the franchisor's dashboard without typing a URL.
//
// It is an operator's tool and guarded like one: the team allowlist, the same
// guard as /admin/entry-points and /admin/outbox, both of which already show a
// signed-in operator every credential used here. Nothing is widened:
//
//   · The franchisee tab is the request's own status link — entry points lists it.
//   · The reviewer tab is the approval EMAIL in the outbox, not a review link
//     lifted out of it. Clicking through from there is exactly what the reviewer
//     does, and the narrowest credential in the build stays gettable only where
//     the email that carries it is (#75).
//   · The corporate tab is the dashboard itself, behind sign-in since phase C;
//     the operator's session opens it and sees what a brand admin sees.
//
// It is not a login-as. Every tab shows what that participant's link opens, and
// nothing else.

import { requireTeamMember } from '@/lib/auth/team';
import { query } from '@/lib/db/pool';
import { getRequestQueue } from '@/lib/db/queries';

import { Walkthrough, type DemoRequest } from './Walkthrough';

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; req?: string }>;
}) {
  await requireTeamMember();
  const { as, req } = await searchParams;

  const [queue, approvals, brands] = await Promise.all([
    getRequestQueue(),
    // The latest approval email per request — a re-review supersedes the first.
    query<{ request_id: string; id: string }>(
      `select distinct on (request_id) request_id, id
         from sent_emails
        where request_id is not null
          and kind in ('review_requested', 'review_requested_again')
        order by request_id, created_at desc`,
    ),
    query<{ slug: string; name: string }>(`select slug, name from brands order by name`),
  ]);

  const approvalByRequest = new Map(approvals.map((row) => [row.request_id, row.id]));
  const requests: DemoRequest[] = queue.map((row) => ({
    id: row.id,
    code: row.code,
    brandSlug: row.brand_slug,
    brandName: row.brand_name,
    locationName: row.location_name,
    status: row.status,
    accessToken: row.access_token,
    approvalEmailId: approvalByRequest.get(row.id) ?? null,
  }));

  return (
    <Walkthrough requests={requests} brands={brands} initialPersona={as} initialRequestId={req} />
  );
}
