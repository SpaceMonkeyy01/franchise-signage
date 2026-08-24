// The quote (SPEC §5.6, §9 interface 5).
//
// The money email, so it does not editorialise. The total is what the portal
// holds, custom-quoted items are named as such rather than folded into a
// figure that would then be wrong, and acceptance happens on the page — never
// from a link in a message. Accepting a quote is a commitment; a mail scanner
// following a link must not be able to make one on the franchisee's behalf,
// which is the same rule the reviewer's links follow (docs/DECISIONS.md #28).
//
// §8b: where a lender is funding this, the budgetary quote PDF is downloadable
// from the same page — so the email points at the page rather than attaching a
// document that would be stale the moment anything is repriced.

import { EmailLayout, money } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface QuoteReadyProps extends FranchiseeEmailBase {
  /** Sum of the priced items across every package on the request. */
  total: number;
  pricedCount: number;
  /** Items with no price yet — quoted by hand, and not in the total. */
  manualCount: number;
  /** Shown only on the internal tail, where we control the turnaround. */
  tat: string | null;
  /** True when the franchisee told us a lender is involved (SPEC §8b). */
  financingInvolved: boolean;
}

export function QuoteReadyEmail(props: QuoteReadyProps) {
  return (
    <EmailLayout
      brand={props.brand}
      preview={`Your signage quote for ${props.locationName} — ${money(props.total)}`}
    >
      <Heading
        title="Your quote is ready"
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <Callout>
        <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
          {money(props.total)}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
          {props.pricedCount} {props.pricedCount === 1 ? 'sign' : 'signs'}, fabrication and
          installation
          {props.manualCount > 0 &&
            ` · ${props.manualCount} custom ${props.manualCount === 1 ? 'item' : 'items'} quoted separately`}
        </p>
      </Callout>

      {props.manualCount > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
          {props.manualCount === 1 ? 'One sign is' : `${props.manualCount} signs are`} custom and
          {props.manualCount === 1 ? ' is' : ' are'} priced by hand — {props.manualCount === 1 ? 'it is' : 'they are'}{' '}
          not in the figure above. You will see {props.manualCount === 1 ? 'it' : 'them'} on the page.
        </p>
      )}

      {props.tat && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
          Once you accept, production runs about <strong>{props.tat}</strong> before installation is
          scheduled.
        </p>
      )}

      {props.financingInvolved && (
        <Callout>
          You told us a lender is funding this. A budgetary quote on Signage.com letterhead — with
          the line items, the total, and everything a loan file needs — is downloadable from your
          request page.
        </Callout>
      )}

      <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151' }}>
        Open your request to see it line by line and accept it there.
      </p>

      <OpenRequest
        brand={props.brand}
        url={props.requestUrl}
        label="Review and accept"
        note="Accepting happens on the page, not from this email — nothing here commits you to anything."
      />
    </EmailLayout>
  );
}
