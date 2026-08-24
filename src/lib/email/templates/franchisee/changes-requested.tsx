// Corporate wants something changed (SPEC §7, §9 interface 5).
//
// The only franchisee notification that asks for action, so it is the only one
// written as a task. Two things it must not do: bury the reviewer's note (that
// note IS the email — everything else is packaging), and imply the whole request
// has stalled. Change requests are per item; the siblings keep moving.

import { EmailLayout } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface ChangesRequestedProps extends FranchiseeEmailBase {
  /** The reviewer's note. Required — SPEC §7 refuses a change request without one. */
  comment: string;
  flaggedItems: string[];
  /** Items on the same request that were not flagged and are unaffected. */
  unaffectedCount: number;
}

export function ChangesRequestedEmail(props: ChangesRequestedProps) {
  const count = props.flaggedItems.length;

  return (
    <EmailLayout
      brand={props.brand}
      preview={`${props.brand.name} asked for a change on ${count === 1 ? 'a sign' : `${count} signs`} — ${props.locationName}`}
    >
      <Heading
        title={count === 1 ? 'One sign needs a change' : `${count} signs need a change`}
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        {props.brand.name} corporate looked at your request and asked for a change before{' '}
        {count === 1 ? 'this one goes' : 'these go'} ahead. Here is what they said:
      </p>

      <Callout tone="warning">
        <p style={{ margin: 0, fontStyle: 'italic' }}>“{props.comment}”</p>
      </Callout>

      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
        {count === 1 ? 'The sign in question' : 'The signs in question'}
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: '#374151' }}>
        {props.flaggedItems.map((name) => (
          <li key={name} style={{ marginBottom: 2 }}>
            {name}
          </li>
        ))}
      </ul>

      {props.unaffectedCount > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
          The other {props.unaffectedCount} {props.unaffectedCount === 1 ? 'sign' : 'signs'} on this
          request {props.unaffectedCount === 1 ? 'is' : 'are'} unaffected and{' '}
          {props.unaffectedCount === 1 ? 'keeps' : 'keep'} moving — you are not starting over.
        </p>
      )}

      <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151' }}>
        Open your request, edit {count === 1 ? 'the flagged sign' : 'the flagged signs'}, and send it
        back. It goes straight to the same reviewer.
      </p>

      <OpenRequest brand={props.brand} url={props.requestUrl} label="Make the change" />
    </EmailLayout>
  );
}
