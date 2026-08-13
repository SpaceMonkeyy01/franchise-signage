// StatusStore over the `pg` pool.
//
// The rules live in src/lib/status/machine.ts and writeback.ts; this is the
// mechanical adapter, the same shape as supabase-store.ts. Anything that moves a
// request goes through here, so every transition writes its event.

import { query, transaction } from './pool';
import type { RequestEventInput } from '../status/events';
import type { StatusStore } from '../status/transition';
import type {
  FulfillmentTail,
  InstalledSignState,
  LineItemState,
  LineItemStatus,
  RequestState,
} from '../status/types';

export function createPgStatusStore(
  exec: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> } = {
    query,
  },
): StatusStore {
  return {
    async getRequest(requestId) {
      const rows = await exec.query<{
        id: string;
        location_id: string;
        intent: RequestState['intent'];
        status: RequestState['status'];
        package_version: number;
      }>(
        `select id, location_id, intent, status, package_version
           from requests where id = $1`,
        [requestId],
      );
      if (!rows[0]) return null;
      return {
        id: rows[0].id,
        locationId: rows[0].location_id,
        intent: rows[0].intent,
        status: rows[0].status,
        packageVersion: rows[0].package_version,
      };
    },

    async getLineItems(requestId) {
      const rows = await exec.query<{
        id: string;
        brand_item_id: string;
        origin: LineItemState['origin'];
        item_status: LineItemStatus;
        sizing: string | null;
        mockup_file_id: string | null;
        replaces_sign_id: string | null;
        est_price_snapshot: string | null;
      }>(
        `select id, brand_item_id, origin, item_status, sizing, mockup_file_id,
                replaces_sign_id, est_price_snapshot
           from line_items where request_id = $1 order by sort_order`,
        [requestId],
      );
      return rows.map((row) => ({
        id: row.id,
        brandItemId: row.brand_item_id,
        origin: row.origin,
        itemStatus: row.item_status,
        sizing: row.sizing,
        mockupFileId: row.mockup_file_id,
        replacesSignId: row.replaces_sign_id,
        estPriceSnapshot: row.est_price_snapshot === null ? null : Number(row.est_price_snapshot),
      }));
    },

    async getInstalledSigns(locationId) {
      const rows = await exec.query<{
        id: string;
        location_id: string;
        brand_item_id: string;
        sizing: string | null;
        mockup_file_id: string | null;
        status: InstalledSignState['status'];
      }>(
        `select id, location_id, brand_item_id, sizing, mockup_file_id, status
           from installed_signs where location_id = $1`,
        [locationId],
      );
      return rows.map((row) => ({
        id: row.id,
        locationId: row.location_id,
        brandItemId: row.brand_item_id,
        sizing: row.sizing,
        mockupFileId: row.mockup_file_id,
        status: row.status,
      }));
    },

    async getFulfillmentTail(requestId): Promise<FulfillmentTail | null> {
      const rows = await exec.query<{ external: boolean }>(
        `select external from quotes where request_id = $1`,
        [requestId],
      );
      if (rows.length === 0) return null;
      // Only fully-internal requests run the automated tail; any external
      // package means milestones are logged by hand (SPEC §4).
      return rows.every((q) => !q.external) ? 'internal' : 'external';
    },

    async updateRequest(requestId, patch) {
      const sets: string[] = [];
      const params: unknown[] = [requestId];
      if (patch.status !== undefined) sets.push(`status = $${params.push(patch.status)}`);
      if (patch.packageVersion !== undefined) {
        sets.push(`package_version = $${params.push(patch.packageVersion)}`);
      }
      if (patch.submittedAt !== undefined) {
        sets.push(`submitted_at = $${params.push(patch.submittedAt.toISOString())}`);
      }
      if (sets.length === 0) return;
      await exec.query(`update requests set ${sets.join(', ')} where id = $1`, params);
    },

    async setLineItemStatus(lineItemId, status) {
      await exec.query(`update line_items set item_status = $2 where id = $1`, [lineItemId, status]);
    },

    async insertEvent(event: RequestEventInput) {
      await exec.query(
        `insert into request_events
           (request_id, line_item_id, kind, actor, summary, detail, from_status, to_status)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          event.requestId,
          event.lineItemId ?? null,
          event.kind,
          event.actor,
          event.summary,
          JSON.stringify(event.detail ?? {}),
          event.fromStatus ?? null,
          event.toStatus ?? null,
        ],
      );
    },

    async insertInstalledSign(row) {
      await exec.query(
        `insert into installed_signs
           (location_id, brand_item_id, sizing, mockup_file_id, source_line_item_id)
         values ($1,$2,$3,$4,$5)`,
        [row.locationId, row.brandItemId, row.sizing, row.mockupFileId, row.sourceLineItemId],
      );
    },

    async updateInstalledSign(installedSignId, patch) {
      await exec.query(
        `update installed_signs
            set sizing = $2, mockup_file_id = $3, source_line_item_id = $4,
                status = 'active', installed_at = current_date
          where id = $1`,
        [installedSignId, patch.sizing, patch.mockupFileId, patch.sourceLineItemId],
      );
    },

    async insertChangeRequest(row) {
      await exec.query(
        `insert into change_requests (request_id, line_item_ids, comment, package_version)
         values ($1,$2,$3,$4)`,
        [row.requestId, row.lineItemIds, row.comment, row.packageVersion],
      );
    },
  };
}

/** Run a status transition in a transaction — the status and its event land together. */
export async function withStatusStore<T>(fn: (store: StatusStore) => Promise<T>): Promise<T> {
  return transaction((exec) => fn(createPgStatusStore(exec)));
}
