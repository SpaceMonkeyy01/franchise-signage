// The receipt for a decision (SPEC §6, §9 interface 5).
//
// Sent by the franchisee's own click, so it confirms rather than informs — the
// point is a record in their inbox of what they agreed to and when. Where a
// lender is involved (§8b) this is also the moment a formal invoice becomes
// available, which is the second reason this email exists at all.

import { EmailLayout, money } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface QuoteAcceptedProps extends FranchiseeEmailBase {
  total: number;
  itemCount: number;
  tat: string | null;
  financingInvolved: boolean;
  /** False on the external tail: the vendor fabricates and we log milestones. */
  internal: boolean;
}

export function QuoteAcceptedEmail(props: QuoteAcceptedProps) {
  return (
    <EmailLayout
      brand={props.brand}
      preview={
        props.itemCount === 1
          ? `Accepted — your sign for ${props.locationName} is going into production`
          : `Accepted — your signs for ${props.locationName} are going into production`
      }
    >
      <Heading
        title="Accepted — we are building it"
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        You accepted the quote for {props.itemCount} {props.itemCount === 1 ? 'sign' : 'signs'} at{' '}
        {props.locationName}, at {money(props.total)}. This email is your record of it.
      </p>

      {props.internal ? (
        <Callout>
          {props.tat ? (
            <>
              Production takes about <strong>{props.tat}</strong>. We will email you when it ships
              and again when it is installed — you do not need to check in.
            </>
          ) : (
            <>
              It is in production now. We will email you when it ships and again when it is
              installed.
            </>
          )}
        </Callout>
      ) : (
        <Callout>
          {props.brand.name} fulfils signage through their own vendor, so the build and the install
          are scheduled with them. We keep your request updated as we hear, so it stays the record
          of what went in at this location.
        </Callout>
      )}

      {props.financingInvolved && (
        <Callout>
          A formal invoice on Signage.com letterhead is on your request page — that is the document
          a lender disburses against.
        </Callout>
      )}

      <OpenRequest brand={props.brand} url={props.requestUrl} label="Track production" />
    </EmailLayout>
  );
}
