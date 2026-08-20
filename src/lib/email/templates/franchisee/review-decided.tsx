// What corporate decided (SPEC §7, §9 interface 5).
//
// SPEC §9 lists "item approved" and "item declined" as notifications. They are
// one template and one send, because approval is per item but REVIEWING is not:
// a reviewer sits down once and decides five signs, and five separate emails
// about one sitting is a worse experience than one email that says what happened.
// Sent when the review completes — nothing left pending — so it is always the
// whole picture (docs/DECISIONS.md #39).
//
// A decline is stated plainly and without apology, with the reviewer's reason
// where they gave one. Softening a decline just means the franchisee asks again.

import { EmailLayout, money } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface DecidedItem {
  id: string;
  name: string;
  /** The reviewer's note, where they left one. */
  note: string | null;
  price: string | null;
}

export interface ReviewDecidedProps extends FranchiseeEmailBase {
  approved: DecidedItem[];
  declined: DecidedItem[];
  /** Standard items that never went to corporate at all. */
  autoApprovedCount: number;
}

export function ReviewDecidedEmail(props: ReviewDecidedProps) {
  const { approved, declined } = props;
  const allDeclined = approved.length === 0 && props.autoApprovedCount === 0;

  // Everything that came out of the review approved, whether corporate looked at
  // it or it was standard enough never to need them — the heading counts what
  // the franchisee now has, not how it got there.
  const approvedCount = approved.length + props.autoApprovedCount;

  const title = allDeclined
    ? 'Corporate could not approve this one'
    : declined.length === 0
      ? `Corporate approved your ${approvedCount === 1 ? 'sign' : 'signs'}`
      : 'Corporate has decided';

  return (
    <EmailLayout brand={props.brand} preview={`${title} — ${props.locationName}`}>
      <Heading
        title={title}
        locationName={props.locationName}
        requestCode={props.requestCode}
      />
      <Greeting name={props.requesterName} />

      {approved.length > 0 && (
        <>
          <Callout>
            <strong>
              {approved.length} {approved.length === 1 ? 'sign is' : 'signs are'} approved
            </strong>{' '}
            and {approved.length === 1 ? 'moves' : 'move'} on to pricing.
            {props.autoApprovedCount > 0 &&
              ` ${props.autoApprovedCount} more never needed a decision — ${
                props.autoApprovedCount === 1 ? 'it is' : 'they are'
              } standard for ${props.brand.name}.`}
          </Callout>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: '#374151' }}>
            {approved.map((item) => (
              <li key={item.id} style={{ marginBottom: 4 }}>
                {item.name} — {money(item.price)}
                {item.note && (
                  <span style={{ color: '#6b7280' }}> · “{item.note}”</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {declined.length > 0 && (
        <>
          <Callout tone="bad">
            <strong>
              {declined.length} {declined.length === 1 ? 'sign was' : 'signs were'} declined.
            </strong>{' '}
            {approved.length > 0
              ? 'The rest of your request is unaffected and keeps moving.'
              : `Nothing on this request is going ahead as it stands. Talk to ${props.brand.name} corporate before resubmitting it.`}
          </Callout>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: '#374151' }}>
            {declined.map((item) => (
              <li key={item.id} style={{ marginBottom: 4 }}>
                {item.name}
                {item.note ? (
                  <span style={{ color: '#6b7280' }}> — “{item.note}”</span>
                ) : (
                  <span style={{ color: '#9ca3af' }}> — no reason given</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!allDeclined && (
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151' }}>
          Next: the Signage.com team prices what was approved and sends you a quote. Nothing is
          needed from you until then.
        </p>
      )}

      <OpenRequest brand={props.brand} url={props.requestUrl} />
    </EmailLayout>
  );
}
