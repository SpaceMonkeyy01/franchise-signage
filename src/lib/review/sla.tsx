// The review SLA (SPEC §3.1, §9 interface 3).
//
// A request sitting in `needs_review` is a franchisee waiting on a landlord
// deadline, so the brand configures how long it will tolerate silence
// (`review_sla_days`) and what happens then (`sla_action`):
//
//   remind      — send the reviewer the same request again. The default, and
//                 the only one that changes nothing about who decides.
//   escalate    — copy the secondary reviewer, or corporate, and say it lapsed.
//   auto_forward— log that the brand's policy is to proceed without a decision.
//                 It does NOT approve anything: nothing here may put words in a
//                 franchisor's mouth, and an item approved by a timer is exactly
//                 that. The team is told to chase it instead.
//
// Idempotent by design — it can run every hour or once a week without spamming:
// a lapse is only acted on once per package version, which is recorded as an
// event and checked before acting.

import { query, queryOne } from '../db/pool';
import { render } from '../email/layout';
import { notifyReviewNeeded } from '../email/notify';
import { sendEmail } from '../email/send';
import { brandSender } from '../email/sender';
import { SlaEscalationEmail } from '../email/templates/sla-escalation';
import { mintReviewLink } from './links';

export interface SlaLapse {
  requestId: string;
  code: string;
  brandName: string;
  action: 'remind' | 'escalate' | 'auto_forward';
  daysWaiting: number;
  handled: boolean;
}

export interface SlaRunResult {
  checked: number;
  lapses: SlaLapse[];
}

/**
 * Find every request whose review has lapsed and apply the brand's policy.
 *
 * Run from a schedule (see src/app/api/cron/review-sla) or by hand with
 * `npm run sla`.
 */
export async function runReviewSla(now = new Date()): Promise<SlaRunResult> {
  const candidates = await query<{
    id: string;
    code: string;
    package_version: number;
    brand_name: string;
    sla_action: 'remind' | 'escalate' | 'auto_forward';
    review_sla_days: number;
    reviewer_email: string | null;
    reviewer_email_secondary: string | null;
    corporate_email: string | null;
    days_waiting: number;
    already_handled: boolean;
  }>(
    `select r.id, r.code, r.package_version,
            b.name as brand_name, b.sla_action, b.review_sla_days,
            b.reviewer_email, b.reviewer_email_secondary, b.corporate_email,
            floor(extract(epoch from ($1::timestamptz - sent.at)) / 86400)::int as days_waiting,
            exists (
              select 1 from request_events e
               where e.request_id = r.id
                 and e.kind = 'review_sla_lapsed'
                 and (e.detail ->> 'packageVersion')::int = r.package_version
            ) as already_handled
       from requests r
       join brands b on b.id = r.brand_id
       join lateral (
         -- When the reviewer was last asked for THIS version. The clock starts
         -- at the ask, not at submission: a request that waited three days for
         -- package prep has not used up the reviewer's week.
         select max(e.created_at) as at
           from request_events e
          where e.request_id = r.id and e.kind = 'review_email_sent'
       ) sent on true
      where r.status = 'needs_review'
        and sent.at is not null
        and sent.at < $1::timestamptz - (b.review_sla_days || ' days')::interval`,
    [now.toISOString()],
  );

  const lapses: SlaLapse[] = [];

  for (const row of candidates) {
    const lapse: SlaLapse = {
      requestId: row.id,
      code: row.code,
      brandName: row.brand_name,
      action: row.sla_action,
      daysWaiting: row.days_waiting,
      handled: false,
    };

    // Acted on once per package version. A resubmission restarts the clock by
    // sending a fresh review email under a new version.
    if (row.already_handled) {
      lapses.push(lapse);
      continue;
    }

    if (row.sla_action === 'remind') {
      // The same ask again, which also mints a fresh link — the original may be
      // days from expiring by now.
      await notifyReviewNeeded(row.id);
    }

    if (row.sla_action === 'escalate') {
      await escalate(row);
    }

    await logLapse(row.id, row.package_version, row.sla_action, row.days_waiting, {
      escalatedTo:
        row.sla_action === 'escalate'
          ? (row.reviewer_email_secondary ?? row.corporate_email ?? null)
          : null,
    });

    lapse.handled = true;
    lapses.push(lapse);
  }

  return { checked: candidates.length, lapses };
}

const SUMMARY: Record<SlaLapse['action'], (days: number) => string> = {
  remind: (days) => `Review SLA lapsed after ${days} day(s) — reminder sent to the reviewer`,
  escalate: (days) =>
    `Review SLA lapsed after ${days} day(s) — escalated per brand policy. No item was decided.`,
  // Deliberate wording: the policy is to proceed, and proceeding is a decision
  // for a human. Nothing auto-approves (SPEC §7).
  auto_forward: (days) =>
    `Review SLA lapsed after ${days} day(s) — brand policy is to proceed without corporate. ` +
    `The Signage.com team must confirm before anything is routed; no item was approved.`,
};

async function logLapse(
  requestId: string,
  packageVersion: number,
  action: SlaLapse['action'],
  days: number,
  detail: Record<string, unknown>,
): Promise<void> {
  await query(
    `insert into request_events (request_id, kind, actor, summary, detail)
     values ($1,'review_sla_lapsed','system',$2,$3)`,
    [requestId, SUMMARY[action](days), JSON.stringify({ ...detail, packageVersion, action, days })],
  );
}

/**
 * Tell someone else it is late.
 *
 * The escalation address is the secondary reviewer if the brand has one, else
 * corporate. If it has neither there is nobody to escalate to, and the event log
 * is the only place the lapse can go — which is still better than silence.
 */
async function escalate(row: {
  id: string;
  code: string;
  brand_name: string;
  review_sla_days: number;
  reviewer_email: string | null;
  reviewer_email_secondary: string | null;
  corporate_email: string | null;
  days_waiting: number;
}): Promise<void> {
  const to = row.reviewer_email_secondary ?? row.corporate_email;
  if (!to) return;

  const context = await queryOne<{
    location_name: string;
    pending_count: number;
    brand_colors: { primary?: string; primaryDark?: string; primaryLight?: string };
  }>(
    `select l.name as location_name,
            (select count(*) from line_items li
              where li.request_id = r.id and li.item_status = 'pending_review')::int as pending_count,
            b.brand_colors
       from requests r
       join locations l on l.id = r.location_id
       join brands b on b.id = r.brand_id
      where r.id = $1`,
    [row.id],
  );
  if (!context) return;

  const link = await mintReviewLink(row.id, to);
  const brand = { name: row.brand_name, brand_colors: context.brand_colors };

  await sendEmail({
    kind: 'review_sla_escalated',
    to,
    subject: `Overdue: signage approval for ${context.location_name}`,
    html: await render(
      <SlaEscalationEmail
        brand={brand}
        locationName={context.location_name}
        requestCode={row.code}
        pendingCount={context.pending_count}
        daysWaiting={row.days_waiting}
        slaDays={row.review_sla_days}
        reviewerEmail={row.reviewer_email ?? 'the reviewer'}
        reviewUrl={link.url}
      />,
    ),
    from: brandSender(row.brand_name),
    requestId: row.id,
  });
}
