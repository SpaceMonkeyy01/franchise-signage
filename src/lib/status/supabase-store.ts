// Supabase implementation of StatusStore. A mechanical adapter — every rule
// lives in machine.ts / writeback.ts, and this file only maps snake_case rows
// to the domain shapes.
//
// Runs under the service role: the transition helper writes request_events,
// which anon is deliberately not granted (see the RLS migration). Callers are
// responsible for having authorized the actor before they get here.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { RequestEventInput } from './events';
import type { StatusStore } from './transition';
import type {
  FulfillmentTail,
  InstalledSignState,
  LineItemState,
  LineItemStatus,
  RequestState,
} from './types';

export function createSupabaseStatusStore(client: SupabaseClient): StatusStore {
  const must = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    async getRequest(requestId) {
      const { data, error } = await client
        .from('requests')
        .select('id, location_id, intent, status, package_version')
        .eq('id', requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        locationId: data.location_id,
        intent: data.intent,
        status: data.status,
        packageVersion: data.package_version,
      } satisfies RequestState;
    },

    async getLineItems(requestId) {
      const data = must(
        await client
          .from('line_items')
          .select(
            'id, brand_item_id, origin, item_status, sizing, mockup_file_id, replaces_sign_id, est_price_snapshot',
          )
          .eq('request_id', requestId)
          .order('sort_order', { ascending: true }),
      );
      return (data ?? []).map(
        (row): LineItemState => ({
          id: row.id,
          brandItemId: row.brand_item_id,
          origin: row.origin,
          itemStatus: row.item_status,
          sizing: row.sizing,
          mockupFileId: row.mockup_file_id,
          replacesSignId: row.replaces_sign_id,
          estPriceSnapshot: row.est_price_snapshot,
        }),
      );
    },

    async getInstalledSigns(locationId) {
      const data = must(
        await client
          .from('installed_signs')
          .select('id, location_id, brand_item_id, sizing, mockup_file_id, status')
          .eq('location_id', locationId),
      );
      return (data ?? []).map(
        (row): InstalledSignState => ({
          id: row.id,
          locationId: row.location_id,
          brandItemId: row.brand_item_id,
          sizing: row.sizing,
          mockupFileId: row.mockup_file_id,
          status: row.status,
        }),
      );
    },

    async getFulfillmentTail(requestId): Promise<FulfillmentTail | null> {
      const data = must(
        await client.from('quotes').select('external').eq('request_id', requestId),
      );
      if (!data || data.length === 0) return null;
      // A request can split across recipients (SPEC §4). It only follows the
      // internal tail's automated path when Signage.com owns every package;
      // any external package means milestones are logged by hand.
      return data.every((q: { external: boolean }) => !q.external) ? 'internal' : 'external';
    },

    async updateRequest(requestId, patch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.packageVersion !== undefined) row.package_version = patch.packageVersion;
      if (patch.submittedAt !== undefined) row.submitted_at = patch.submittedAt.toISOString();
      if (Object.keys(row).length === 0) return;
      const { error } = await client.from('requests').update(row).eq('id', requestId);
      if (error) throw new Error(error.message);
    },

    async setLineItemStatus(lineItemId: string, status: LineItemStatus) {
      const { error } = await client
        .from('line_items')
        .update({ item_status: status })
        .eq('id', lineItemId);
      if (error) throw new Error(error.message);
    },

    async insertEvent(event: RequestEventInput) {
      const { error } = await client.from('request_events').insert({
        request_id: event.requestId,
        line_item_id: event.lineItemId ?? null,
        kind: event.kind,
        actor: event.actor,
        summary: event.summary,
        detail: event.detail ?? {},
        from_status: event.fromStatus ?? null,
        to_status: event.toStatus ?? null,
      });
      if (error) throw new Error(error.message);
    },

    async insertInstalledSign(row) {
      const { error } = await client.from('installed_signs').insert({
        location_id: row.locationId,
        brand_item_id: row.brandItemId,
        sizing: row.sizing,
        mockup_file_id: row.mockupFileId,
        source_line_item_id: row.sourceLineItemId,
      });
      if (error) throw new Error(error.message);
    },

    async updateInstalledSign(installedSignId, patch) {
      const { error } = await client
        .from('installed_signs')
        .update({
          sizing: patch.sizing,
          mockup_file_id: patch.mockupFileId,
          source_line_item_id: patch.sourceLineItemId,
          status: 'active',
          installed_at: new Date().toISOString().slice(0, 10),
        })
        .eq('id', installedSignId);
      if (error) throw new Error(error.message);
    },

    async insertChangeRequest(row) {
      const { error } = await client.from('change_requests').insert({
        request_id: row.requestId,
        line_item_ids: row.lineItemIds,
        comment: row.comment,
        package_version: row.packageVersion,
      });
      if (error) throw new Error(error.message);
    },
  };
}
