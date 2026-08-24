// Done — and the reason the record exists (SPEC §5.2, §9 interface 5).
//
// The last email of a request, and the only one that explains the thing the
// portal is actually for. `completed` is the ONLY transition that writes
// installed_signs, so from this moment the location has a permanent record of
// what is on the building — which is what turns the next request into a lookup
// instead of a form. Saying so here is what makes a franchisee use the link
// again in two years when a sign is damaged.

import { EmailLayout } from '../../layout';
import { Callout, Greeting, Heading, OpenRequest, type FranchiseeEmailBase } from './shell';

export interface InstalledProps extends FranchiseeEmailBase {
  itemCount: number;
  /** Where the permanent record now lives — the location, not this request. */
  locationUrl: string;
  note: string | null;
  /**
   * Packages on this request still outstanding (SPEC §6, amended v2.2).
   *
   * Non-zero means one half of a split site is up and the other is not. Telling
   * someone standing in front of their own building that it is finished when it
   * plainly is not is the most visible wrong claim this system can make.
   */
  outstandingPackages: number;
}

export function InstalledEmail(props: InstalledProps) {
  const partial = props.outstandingPackages > 0;

  return (
    <EmailLayout
      brand={props.brand}
      preview={
        partial
          ? `Installed — part of ${props.locationName} is up`
          : `Installed — ${props.locationName} is signed`
      }
    >
      <Heading
        title={partial ? 'Installed — this part' : 'Installed'}
        locationName={props.locationName}
        requestCode={props.requestCode}
        packageLabel={props.packageLabel}
      />
      <Greeting name={props.requesterName} />

      <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
        {props.itemCount === 1 ? 'Your sign is' : `All ${props.itemCount} signs are`} up at{' '}
        {props.locationName}.{' '}
        {partial
          ? `The rest of your signage is with ${
              props.outstandingPackages === 1 ? 'another supplier' : 'your other suppliers'
            }, and is not up yet — we will tell you when it is.`
          : 'That closes this request.'}
      </p>

      {props.note && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#374151' }}>
          From the team: {props.note}
        </p>
      )}

      <Callout>
        {props.itemCount === 1 ? 'It is' : 'They are'} now on your location&apos;s permanent record,
        with the exact specs {props.itemCount === 1 ? 'it was' : 'they were'} built to. If a sign is
        ever damaged, replacing it is a couple of clicks from that record — no forms, no specs to
        dig up, and a like-for-like replacement does not go back to corporate at all.
      </Callout>

      <OpenRequest
        brand={props.brand}
        url={props.locationUrl}
        label="See your location record"
        note="Worth keeping. This is where every future signage request for this location starts."
      />
    </EmailLayout>
  );
}
