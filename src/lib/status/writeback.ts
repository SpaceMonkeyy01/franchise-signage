// The installed_signs writeback (SPEC §6).
//
// `completed` is the ONLY transition that writes the location record. This is
// the step that makes every future request a lookup instead of a project, so it
// is planned as pure data first and applied second — the plan is assertable in
// tests and inspectable in a log.

import type { InstalledSignState, LineItemState, RequestState } from './types';

export interface InstalledSignInsert {
  kind: 'insert';
  locationId: string;
  brandItemId: string;
  sizing: string | null;
  mockupFileId: string | null;
  sourceLineItemId: string;
}

export interface InstalledSignUpdate {
  kind: 'update';
  /** The installed_signs row being replaced in place. */
  installedSignId: string;
  sizing: string | null;
  mockupFileId: string | null;
  sourceLineItemId: string;
}

export type WritebackOperation = InstalledSignInsert | InstalledSignUpdate;

export interface WritebackPlan {
  operations: WritebackOperation[];
  /** Items that wrote nothing, and why — declines are normal, not errors. */
  skipped: Array<{ lineItemId: string; reason: 'declined' | 'not_approved' | 'missing_target' }>;
}

const APPROVED: ReadonlySet<string> = new Set(['approved', 'auto_approved']);

/**
 * Plan the location-record writeback for a request reaching `completed`.
 *
 * Approved items become installed signs. A like-for-like replacement UPDATES
 * the row it replaces rather than inserting a second one (SPEC §5.2: "replacement
 * updates the row rather than duplicating") — otherwise a location that has
 * replaced its menu board twice would appear to own three menu boards.
 *
 * Declined items write nothing, which is the whole point of line-item approval:
 * one declined add-on never blocks the rest of the location going on the record.
 */
export function planInstalledSignWriteback(
  request: Pick<RequestState, 'locationId'>,
  items: readonly LineItemState[],
  installedSigns: readonly InstalledSignState[],
): WritebackPlan {
  const byId = new Map(installedSigns.map((s) => [s.id, s]));
  const operations: WritebackOperation[] = [];
  const skipped: WritebackPlan['skipped'] = [];

  for (const item of items) {
    if (item.itemStatus === 'declined') {
      skipped.push({ lineItemId: item.id, reason: 'declined' });
      continue;
    }
    if (!APPROVED.has(item.itemStatus)) {
      skipped.push({ lineItemId: item.id, reason: 'not_approved' });
      continue;
    }

    if (item.origin === 'replacement' && item.replacesSignId) {
      const target = byId.get(item.replacesSignId);
      if (!target) {
        // The row it claims to replace is not on this location. Refuse to
        // silently insert a duplicate — the team resolves it.
        skipped.push({ lineItemId: item.id, reason: 'missing_target' });
        continue;
      }
      operations.push({
        kind: 'update',
        installedSignId: target.id,
        // A like-for-like replacement keeps the installed record's sizing when
        // the new item did not restate it — the specs came from that record.
        sizing: item.sizing ?? target.sizing,
        mockupFileId: item.mockupFileId ?? target.mockupFileId,
        sourceLineItemId: item.id,
      });
      continue;
    }

    operations.push({
      kind: 'insert',
      locationId: request.locationId,
      brandItemId: item.brandItemId,
      sizing: item.sizing,
      mockupFileId: item.mockupFileId,
      sourceLineItemId: item.id,
    });
  }

  return { operations, skipped };
}
