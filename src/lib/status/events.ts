// Event kinds and the wording of the timeline.
//
// request_events.kind is a TEXT column with no CHECK constraint, on purpose:
// SPEC §8b's phase-2 permit stages must become loggable without a migration.
// This file is where the known vocabulary actually lives. Adding a kind here is
// a one-line change; adding one to the database is nothing at all.

import type { EventActor, RequestStatus } from './types';

export const EVENT_KINDS = [
  // Franchisee
  'request_created',
  'request_submitted',
  'request_resubmitted',
  'file_uploaded',
  'quote_accepted',
  // Team
  'package_prepared',
  'mockup_attached',
  'item_priced',
  'quote_sent',
  // Only on failure. `quote_sent` already says which packages went where; this
  // exists so a package the mail provider rejected is visible on the timeline
  // rather than only in the outbox.
  'vendor_package_failed',
  'quote_delivered',
  'production_started',
  'shipped',
  'installed',
  // Reviewer / corporate
  'item_approved',
  'item_declined',
  'changes_requested',
  'review_email_sent',
  'review_sla_lapsed',
  // §8b — tracked, never automated. Logged by hand by the team.
  'landlord_criteria_reviewed',
  'landlord_approval',
  // §8b phase 2 — the permit stages. Listed so the vocabulary is visible, NOT
  // built: MVP logs them only if a human does, and no status depends on them.
  'drawings_prepared',
  'landlord_approved',
  'permit_submitted',
  'permit_issued',
  // §8c
  'did_issued',
  'did_converted_to_location',
  // Generic
  'status_changed',
  'note_added',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface RequestEventInput {
  requestId: string;
  lineItemId?: string | null;
  /** Typed for the known vocabulary, widened to string so phase-2 kinds work. */
  kind: EventKind | (string & {});
  actor: EventActor;
  /** The line a timeline renders. Phrase it the way docs/flow-demo.jsx does. */
  summary: string;
  detail?: Record<string, unknown>;
  fromStatus?: RequestStatus | null;
  toStatus?: RequestStatus | null;
}

/** Default wording for a bare status change, when the caller has nothing better. */
export function statusChangeSummary(from: RequestStatus, to: RequestStatus): string {
  return `Status changed: ${from.replace(/_/g, ' ')} → ${to.replace(/_/g, ' ')}`;
}
