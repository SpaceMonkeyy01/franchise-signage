// It has left the building (SPEC §6 internal tail, §9 interface 5).
//
// The shortest template in the set, on purpose. It carries one fact and the
// portal has no carrier integration, so it promises no tracking number and no
// date — inventing either here is how a franchisee ends up standing outside a
// closed store waiting for a truck.

import { EmailLayout } from '../../layout';
import { Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface ShippedProps extends FranchiseeEmailBase {
  itemCount: number;
  /** What the team typed when they logged the milestone, if anything. */
  note: string | null;
}

export function ShippedEmail(props: ShippedProps) {
  // Most requests are one sign, and a heading about "signs" when exactly one
  // shipped is the seam that makes an email read as generated. The body already
  // counts; the heading and the preview line should too.
  const one = props.itemCount === 1;
  return (
    <EmailLayout
      brand={props.brand}
      preview={`Your ${one ? 'sign' : 'signs'} for ${props.locationName} ${one ? 'has' : 'have'} shipped`}
    >
      <Heading
        title={one ? 'Your sign has shipped' : 'Your signs have shipped'}
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        {props.itemCount === 1 ? 'Your sign' : `All ${props.itemCount} signs`} for{' '}
        {props.locationName} left production and{' '}
        {props.itemCount === 1 ? 'is' : 'are'} on the way. The Signage.com team coordinates the
        install from here and will be in touch about timing.
      </p>

      {props.note && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
          From the team: {props.note}
        </p>
      )}

      <OpenRequest brand={props.brand} url={props.requestUrl} />
    </EmailLayout>
  );
}
