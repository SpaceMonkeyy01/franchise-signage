// The franchisee notification set (SPEC §9 interface 5).
//
// Seven moments, one entry point. Each is called AFTER the transition that
// causes it has committed, for the reason notify.tsx states: a mail failure must
// never roll back a status change.
//
// Two rules hold across all seven.
//
// Sent AS THE BRAND (SPEC §8d). The franchisee signed an agreement with their
// franchisor, not with Signage.com; mail that arrives from a vendor they have
// never heard of reads like spam, and the co-branded chrome is the whole point
// of the program.
//
// Addressed to `requests.requester_email` — the person who actually filled the
// form. Not the brand's registered franchisee address (§8d), which is the
// account-level contact and may be someone else entirely.

import { getRequestById, type RequestDetail } from '../db/queries';
import { query, queryOne } from '../db/pool';
import { render } from './layout';
import { brandSender } from './sender';
import { sendEmail, type SendResult } from './send';
import type { FranchiseeEmailBase } from './templates/franchisee/shell';
import { SubmittedEmail } from './templates/franchisee/submitted';
import { ChangesRequestedEmail } from './templates/franchisee/changes-requested';
import { ReviewDecidedEmail, type DecidedItem } from './templates/franchisee/review-decided';
import { QuoteReadyEmail } from './templates/franchisee/quote-ready';
import { QuoteAcceptedEmail } from './templates/franchisee/quote-accepted';
import { ShippedEmail } from './templates/franchisee/shipped';
import { InstalledEmail } from './templates/franchisee/installed';

export type FranchiseeNotification =
  | 'submitted'
  | 'changes_requested'
  | 'review_decided'
  | 'quote_ready'
  | 'quote_accepted'
  | 'shipped'
  | 'installed';

export interface FranchiseeNotifyOutcome {
  sent: boolean;
  reason?: 'not_found' | 'no_recipient' | 'nothing_to_say';
  result?: SendResult;
}

interface Composed {
  subject: string;
  element: React.ReactElement;
}

function baseProps(request: RequestDetail, appUrl: string): FranchiseeEmailBase {
  return {
    brand: request.brand,
    // Filled in by the caller from the contact row — see notifyFranchisee.
    requesterName: null,
    locationName: request.location.name,
    requestCode: request.code,
    requestUrl: `${appUrl}/${request.brand.slug}/request/${request.access_token}`,
  };
}

/**
 * Tell the franchisee something happened.
 *
 * Returns rather than throws on every "nothing to send" case — a request with no
 * requester email is a legitimate state (the team can create one on a
 * franchisee's behalf), not an error worth failing a transition over.
 */
export async function notifyFranchisee(
  requestId: string,
  notification: FranchiseeNotification,
  options: { note?: string | null } = {},
): Promise<FranchiseeNotifyOutcome> {
  const request = await getRequestById(requestId);
  if (!request) return { sent: false, reason: 'not_found' };

  // requester_email is not on RequestDetail: it is contact information, and the
  // franchisee status page is rendered from that type in a browser.
  const contact = await queryOne<{ requester_email: string | null; requester_name: string | null }>(
    `select requester_email, requester_name from requests where id = $1`,
    [requestId],
  );
  if (!contact?.requester_email) return { sent: false, reason: 'no_recipient' };

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const base = { ...baseProps(request, appUrl), requesterName: contact.requester_name };

  const composed = compose(notification, request, base, appUrl, options.note ?? null);
  if (!composed) return { sent: false, reason: 'nothing_to_say' };

  const html = await render(composed.element);
  const result = await sendEmail({
    kind: `franchisee_${notification}`,
    to: contact.requester_email,
    subject: composed.subject,
    html,
    from: brandSender(request.brand.name),
    requestId,
  });

  // Only failures reach the timeline (docs/DECISIONS.md #38): the transition
  // event already says what happened, and a franchisee who was never told is
  // something the team has to be able to see without opening the outbox.
  if (result.error) {
    await query(
      `insert into request_events (request_id, kind, actor, summary, detail)
       values ($1,'franchisee_email_failed','system',$2,$3)`,
      [
        requestId,
        `The "${notification.replace(/_/g, ' ')}" email to ${contact.requester_email} did NOT send — ${result.error}`,
        JSON.stringify({ notification, to: contact.requester_email, error: result.error }),
      ],
    );
  }

  return { sent: result.delivered, result };
}

function compose(
  notification: FranchiseeNotification,
  request: RequestDetail,
  base: FranchiseeEmailBase,
  appUrl: string,
  note: string | null,
): Composed | null {
  const items = request.items;
  const live = items.filter((item) => item.item_status !== 'declined');

  switch (notification) {
    case 'submitted': {
      return {
        subject: `We have your signage request — ${request.location.name} (${request.code})`,
        element: (
          <SubmittedEmail
            {...base}
            itemCount={items.length}
            autoApprovedCount={items.filter((i) => i.item_status === 'auto_approved').length}
            reviewCount={items.filter((i) => i.item_status === 'pending_review').length}
            tbdCount={items.filter((i) => i.tbd_fields.length > 0).length}
          />
        ),
      };
    }

    case 'changes_requested': {
      const change = request.change_request;
      if (!change) return null;
      const flagged = items.filter((item) => change.line_item_ids.includes(item.id));
      if (flagged.length === 0) return null;
      return {
        subject: `A change is needed on ${flagged.length === 1 ? 'a sign' : `${flagged.length} signs`} — ${request.location.name}`,
        element: (
          <ChangesRequestedEmail
            {...base}
            comment={change.comment}
            flaggedItems={flagged.map((item) => item.brand_item_name)}
            unaffectedCount={items.length - flagged.length}
          />
        ),
      };
    }

    case 'review_decided': {
      const decided = (status: string): DecidedItem[] =>
        items
          .filter((item) => item.item_status === status)
          .map((item) => ({
            id: item.id,
            name: item.brand_item_name,
            note: item.review_note,
            price: item.est_price_snapshot,
          }));
      const approved = decided('approved');
      const declined = decided('declined');
      // Nothing went to corporate at all — the fast lane. There is no decision
      // to report, and an email saying so would undercut the point of it.
      if (approved.length === 0 && declined.length === 0) return null;
      return {
        subject:
          declined.length === 0
            ? `Approved — ${request.location.name} (${request.code})`
            : `${request.brand.name} has decided on your signs — ${request.location.name}`,
        element: (
          <ReviewDecidedEmail
            {...base}
            approved={approved}
            declined={declined}
            autoApprovedCount={items.filter((i) => i.item_status === 'auto_approved').length}
          />
        ),
      };
    }

    case 'quote_ready': {
      const total = request.quotes.reduce((sum, q) => sum + Number(q.priced_total ?? 0), 0);
      const manualCount = request.quotes.reduce((sum, q) => sum + q.manual_count, 0);
      const pricedCount = request.quotes.reduce((sum, q) => sum + q.priced_count, 0);
      return {
        subject: `Your signage quote — ${request.location.name} (${request.code})`,
        element: (
          <QuoteReadyEmail
            {...base}
            total={total}
            pricedCount={pricedCount}
            manualCount={manualCount}
            tat={request.quotes.find((q) => !q.external)?.tat ?? null}
            financingInvolved={request.financing_involved === true}
          />
        ),
      };
    }

    case 'quote_accepted': {
      const total = request.quotes.reduce((sum, q) => sum + Number(q.priced_total ?? 0), 0);
      return {
        subject: `Accepted — ${request.location.name} (${request.code})`,
        element: (
          <QuoteAcceptedEmail
            {...base}
            total={total}
            itemCount={live.length}
            tat={request.quotes.find((q) => !q.external)?.tat ?? null}
            financingInvolved={request.financing_involved === true}
            internal={request.quotes.some((q) => !q.external)}
          />
        ),
      };
    }

    case 'shipped': {
      return {
        subject: `Shipped — ${request.location.name} (${request.code})`,
        element: <ShippedEmail {...base} itemCount={live.length} note={note} />,
      };
    }

    case 'installed': {
      return {
        subject: `Installed — ${request.location.name} is signed`,
        element: (
          <InstalledEmail
            {...base}
            itemCount={live.length}
            locationUrl={`${appUrl}/${request.brand.slug}/location/${request.location.id}/request`}
            note={note}
          />
        ),
      };
    }
  }
}
