// Package readiness — what a request carries, and what is still to follow up.
//
// Every fact here is already on the request: the location's address and
// opening date, each item's photo, sizing and TBD flags, the corporate
// decisions, the lease sign exhibit and the team's §8b criteria check. What was
// missing was one place that reads them together, so a franchisee sees their
// package the way the team preps it and the team sees at a glance what to chase.
//
// It never gates anything. TBD is always allowed (SPEC §3) and nothing here
// holds up a submission, a review or a quote: a row that is not done says who
// follows up, never what the franchisee must do before anything can move.

import type { RequestDetail } from './db/queries';
import { isReviewOpen } from './status/types';

export type ReadinessState = 'done' | 'follow_up' | 'with_corporate';

export interface ReadinessRow {
  key: 'location' | 'photos' | 'sizing' | 'approvals' | 'landlord';
  label: string;
  state: ReadinessState;
  /** The short answer on the right of the row: "2 of 4 signs", "Received". */
  value: string;
}

export interface Readiness {
  rows: ReadinessRow[];
  /** Nothing to follow up and nothing waiting on corporate. */
  reviewReady: boolean;
  followUps: number;
}

type ReadinessInput = Pick<RequestDetail, 'intent' | 'location' | 'items' | 'files' | 'events'> &
  Partial<Pick<RequestDetail, 'status' | 'package_version'>>;

const APPROVED = new Set(['auto_approved', 'approved']);

export function packageReadiness(request: ReadinessInput): Readiness {
  const rows: ReadinessRow[] = [];
  // Only a new store's first request collects location details and the lease
  // exhibit; later requests are made against a location that already has them.
  const setup = request.intent === 'initial_setup';
  const items = request.items;
  const total = items.length;

  if (setup) {
    const address = request.location.address ?? {};
    const missing = [
      !address.line1 && 'street',
      !address.city && 'city',
      !address.state && 'state',
      !address.zip && 'ZIP',
      !request.location.opening_date && 'opening date',
    ].filter((part): part is string => Boolean(part));
    rows.push({
      key: 'location',
      label: 'Location details',
      state: missing.length === 0 ? 'done' : 'follow_up',
      value: missing.length === 0 ? 'Received' : `${capitalise(missing.join(', '))} to confirm`,
    });
  }

  // A replacement's photo shows the damaged sign; everything else's shows where
  // the sign goes.
  const photoKind = request.intent === 'replace_like' ? 'condition_photo' : 'placement_photo';
  const photographed = items.filter((item) => item.files.some((file) => file.kind === photoKind)).length;
  rows.push({
    key: 'photos',
    label: request.intent === 'replace_like' ? 'Condition photos' : 'Site photos',
    state: photographed === total ? 'done' : 'follow_up',
    value: `${photographed} of ${total} ${total === 1 ? 'sign' : 'signs'}`,
  });

  // A replacement's sizing comes from the installed record, so there is nothing
  // for anyone to confirm.
  if (request.intent !== 'replace_like') {
    const open = items.filter((item) => item.tbd_fields.length > 0 || !item.sizing?.trim()).length;
    rows.push({
      key: 'sizing',
      label: 'Sizes and site details',
      state: open === 0 ? 'done' : 'follow_up',
      value: open === 0 ? 'All confirmed' : `${open} TBD`,
    });
  }

  const approved = items.filter((item) => APPROVED.has(item.item_status)).length;
  const withCorporate = items.filter((item) => item.item_status === 'pending_review').length;
  const needsChanges = items.filter((item) => item.item_status === 'changes_requested').length;
  const declined = items.filter((item) => item.item_status === 'declined').length;
  const decided = total - declined;
  rows.push({
    key: 'approvals',
    label: 'Approved signs',
    state: needsChanges > 0 ? 'follow_up' : withCorporate > 0 ? 'with_corporate' : 'done',
    value: [
      `${approved} of ${decided} approved`,
      // Before package prep the items are not with corporate yet (SPEC §6).
      withCorporate > 0 &&
        (request.status &&
        request.package_version !== undefined &&
        !isReviewOpen({ status: request.status, packageVersion: request.package_version })
          ? `${withCorporate} go to corporate next`
          : `${withCorporate} with corporate`),
      needsChanges > 0 && `${needsChanges} ${needsChanges === 1 ? 'needs' : 'need'} changes`,
      declined > 0 && `${declined} declined`,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  if (setup) {
    const exhibit = request.files.some((file) => file.kind === 'landlord_criteria');
    // The team's §8b check, latest first: it can be logged again at re-prep.
    const review = [...request.events]
      .reverse()
      .find((event) => event.kind === 'landlord_criteria_reviewed');
    const reviewed = review?.detail?.result === 'yes';
    rows.push({
      key: 'landlord',
      label: 'Landlord sign criteria',
      state: exhibit ? 'done' : 'follow_up',
      value: reviewed
        ? 'Reviewed by Signage.com'
        : exhibit
          ? 'Lease exhibit attached'
          : 'Flagged for follow-up',
    });
  }

  const followUps = rows.filter((row) => row.state === 'follow_up').length;
  return {
    rows,
    followUps,
    reviewReady: rows.every((row) => row.state === 'done'),
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
