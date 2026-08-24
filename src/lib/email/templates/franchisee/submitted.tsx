// "We have it." (SPEC §9 interface 5)
//
// The first thing a franchisee gets after filling in a form they were not
// trained on, so its whole job is to remove doubt: it arrived, here is what
// happens now, here is the link back. It promises no dates — nothing has been
// priced or reviewed yet, and a number invented here becomes the number they
// remember.

import { EmailLayout } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface SubmittedProps extends FranchiseeEmailBase {
  itemCount: number;
  /** Items that need no corporate decision — the fast lane's promise, in numbers. */
  autoApprovedCount: number;
  /** Items that do. Zero means nobody is waiting on corporate at all. */
  reviewCount: number;
  /** Site details the franchisee marked TBD; the team chases these. */
  tbdCount: number;
}

export function SubmittedEmail(props: SubmittedProps) {
  const { itemCount, autoApprovedCount, reviewCount } = props;

  return (
    <EmailLayout
      brand={props.brand}
      preview={`We have your signage request for ${props.locationName}`}
    >
      <Heading
        title="Your signage request is in"
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        We have your request for {itemCount} {itemCount === 1 ? 'sign' : 'signs'} at{' '}
        {props.locationName}. Nothing more is needed from you right now.
      </p>

      {reviewCount === 0 ? (
        <Callout>
          Everything you asked for is standard for {props.brand.name}, so none of it needs corporate
          approval. It goes straight to the Signage.com team for pricing.
        </Callout>
      ) : (
        <Callout>
          {autoApprovedCount > 0 && (
            <>
              <strong>
                {autoApprovedCount} {autoApprovedCount === 1 ? 'item is' : 'items are'} already
                moving
              </strong>{' '}
              — {autoApprovedCount === 1 ? 'it is' : 'they are'} standard for {props.brand.name} and
              {autoApprovedCount === 1 ? ' needs' : ' need'} nobody&apos;s approval.{' '}
            </>
          )}
          {reviewCount} {reviewCount === 1 ? 'item goes' : 'items go'} to {props.brand.name}{' '}
          corporate for a decision. We will tell you either way — and a decision on one never holds
          up the others.
        </Callout>
      )}

      {props.tbdCount > 0 && (
        <Callout tone="warning">
          You marked {props.tbdCount} {props.tbdCount === 1 ? 'detail' : 'details'} as still to be
          confirmed. That is fine and it does not hold anything up — the Signage.com team will chase
          {props.tbdCount === 1 ? ' it' : ' them'} with you.
        </Callout>
      )}

      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#111827' }}>
        What happens next
      </p>
      <ol style={{ margin: '0 0 4px', paddingLeft: 18, fontSize: 13, color: '#374151' }}>
        {reviewCount > 0 && <li style={{ marginBottom: 4 }}>{props.brand.name} corporate reviews what needs reviewing.</li>}
        <li style={{ marginBottom: 4 }}>Signage.com prices it and sends you a quote.</li>
        <li style={{ marginBottom: 4 }}>You accept the quote, and it goes into production.</li>
      </ol>

      <OpenRequest brand={props.brand} url={props.requestUrl} label="Track your request" />
    </EmailLayout>
  );
}
